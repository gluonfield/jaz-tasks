package httpx_test

import (
	"bufio"
	"bytes"
	"compress/gzip"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gluonfield/jaz-tasks/httpx"
)

func TestCompression(t *testing.T) {
	body := strings.Repeat(`{"message":"A customer conversation with repeated content"}`, 100)
	for _, test := range []struct {
		name, accept, mime, encoding string
	}{
		{"gzip", "gzip", "application/json", "gzip"},
		{"no negotiation", "", "application/json", ""},
		{"identity", "identity", "application/json", ""},
		{"refused", "gzip;q=0", "application/json", ""},
		{"wildcard", "*;q=0.5", "application/json", "gzip"},
		{"explicit refusal beats wildcard", "gzip;q=0, *;q=1", "application/json", ""},
		{"identity preferred", "identity;q=1, gzip;q=0.5", "application/json", ""},
		{"html", "gzip", "text/html; charset=utf-8", "gzip"},
		{"javascript", "gzip", "application/javascript", "gzip"},
		{"svg", "gzip", "image/svg+xml", "gzip"},
		{"binary", "gzip", "image/png", ""},
	} {
		t.Run(test.name, func(t *testing.T) {
			handler := httpx.Compress(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", test.mime)
				w.Header().Set("Content-Length", strconv.Itoa(len(body)))
				w.Header().Add("Vary", "Origin")
				w.Header().Set("ETag", `"version-1"`)
				w.WriteHeader(http.StatusCreated)
				_, _ = io.WriteString(w, body)
			}))
			srv := httptest.NewServer(handler)
			defer srv.Close()
			response, raw := request(t, srv.URL, http.MethodGet, http.Header{"Accept-Encoding": {test.accept}})
			if response.StatusCode != http.StatusCreated || response.Header.Get("Content-Encoding") != test.encoding {
				t.Fatalf("status/encoding: %d %v", response.StatusCode, response.Header)
			}
			vary := strings.Join(response.Header.Values("Vary"), ",")
			if !strings.Contains(vary, "Accept-Encoding") || !strings.Contains(vary, "Origin") {
				t.Fatalf("lost cache variation: %q", vary)
			}
			if got := decoded(t, response, raw); string(got) != body {
				t.Fatalf("body changed: decoded %d bytes, want %d", len(got), len(body))
			}
			if test.encoding != "" && (len(raw) >= len(body)/2 || response.Header.Get("ETag") != `W/"version-1"`) {
				t.Fatalf("compression or validator: %d bytes, %v", len(raw), response.Header)
			}
		})
	}
}

func TestFileAndEmptyResponses(t *testing.T) {
	dir := t.TempDir()
	body := strings.Repeat("A real static asset.\n", 100)
	if err := os.WriteFile(filepath.Join(dir, "app.js"), []byte(body), 0600); err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(httpx.Compress(http.FileServer(http.Dir(dir))))
	defer srv.Close()
	full, raw := request(t, srv.URL+"/app.js", http.MethodGet, http.Header{"Accept-Encoding": {"gzip"}})
	if full.Header.Get("Content-Encoding") != "gzip" || string(decoded(t, full, raw)) != body {
		t.Fatal("static file was not compressed losslessly")
	}
	for _, test := range []struct {
		name, method string
		headers      http.Header
		status       int
		body         string
	}{
		{"head", http.MethodHead, http.Header{}, http.StatusOK, ""},
		{"range", http.MethodGet, http.Header{"Range": {"bytes=0-9"}}, http.StatusPartialContent, body[:10]},
		{"not modified", http.MethodGet, http.Header{"If-Modified-Since": {full.Header.Get("Last-Modified")}}, http.StatusNotModified, ""},
	} {
		t.Run(test.name, func(t *testing.T) {
			test.headers.Set("Accept-Encoding", "gzip")
			res, data := request(t, srv.URL+"/app.js", test.method, test.headers)
			if res.StatusCode != test.status || res.Header.Get("Content-Encoding") != "" || string(data) != test.body {
				t.Fatalf("file semantics: %d %v, body %q", res.StatusCode, res.Header, data)
			}
		})
	}

	for _, status := range []int{http.StatusNoContent, http.StatusNotModified} {
		t.Run(strconv.Itoa(status), func(t *testing.T) {
			handler := httpx.Compress(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(status)
			}))
			recorder := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			req.Header.Set("Accept-Encoding", "gzip")
			handler.ServeHTTP(recorder, req)
			if recorder.Code != status || recorder.Body.Len() != 0 || recorder.Header().Get("Content-Encoding") != "" {
				t.Fatalf("bodyless response changed: %v", recorder.Result())
			}
		})
	}
}

func TestStreamingAndExistingEncoding(t *testing.T) {
	finish := make(chan struct{})
	srv := httptest.NewServer(httpx.Compress(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "data: first\n\n")
		if err := http.NewResponseController(w).Flush(); err != nil {
			t.Error(err)
			return
		}
		select {
		case <-finish:
			_, _ = io.WriteString(w, "data: last\n\n")
		case <-r.Context().Done():
		}
	})))
	defer srv.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, srv.URL, nil)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if !res.Uncompressed {
		t.Fatal("native Go client did not receive a compressed stream")
	}
	reader := bufio.NewReader(res.Body)
	first, err := reader.ReadString('\n')
	if err != nil || first != "data: first\n" {
		t.Fatalf("stream was buffered until completion: %q %v", first, err)
	}
	close(finish)
	rest, err := io.ReadAll(reader)
	if err != nil || string(rest) != "\ndata: last\n\n" {
		t.Fatalf("stream trailer/body: %q %v", rest, err)
	}

	var original bytes.Buffer
	encoder := gzip.NewWriter(&original)
	_, _ = encoder.Write([]byte("already encoded"))
	_ = encoder.Close()
	handler := httpx.Compress(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Encoding", "gzip")
		_, _ = w.Write(original.Bytes())
	}))
	recorder := httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	handler.ServeHTTP(recorder, req)
	if !bytes.Equal(recorder.Body.Bytes(), original.Bytes()) {
		t.Fatal("response was compressed twice")
	}
}

func request(t *testing.T, url, method string, headers http.Header) (*http.Response, []byte) {
	t.Helper()
	req, _ := http.NewRequest(method, url, nil)
	req.Header = headers
	transport := &http.Transport{DisableCompression: true}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: 3 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	body, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	return res, body
}

func decoded(t *testing.T, response *http.Response, body []byte) []byte {
	t.Helper()
	if response.Header.Get("Content-Encoding") == "" {
		return body
	}
	reader, err := gzip.NewReader(bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	defer reader.Close()
	decoded, err := io.ReadAll(reader)
	if err != nil {
		t.Fatal(err)
	}
	return decoded
}
