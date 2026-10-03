package httpx

import (
	"compress/gzip"
	"net/http"
	"strconv"
	"strings"
)

// Compress encodes textual responses at the origin, including flushed streams.
func Compress(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Add("Vary", "Accept-Encoding")
		if r.Method == http.MethodHead || r.Header.Get("Range") != "" || r.Header.Get("Upgrade") != "" {
			next.ServeHTTP(w, r)
			return
		}
		if !acceptsGzip(r.Header.Values("Accept-Encoding")) {
			next.ServeHTTP(w, r)
			return
		}
		cw := &compressedWriter{ResponseWriter: w}
		defer func() {
			if cw.encoder != nil {
				_ = cw.encoder.Close()
			}
		}()
		next.ServeHTTP(cw, r)
	})
}

func acceptsGzip(values []string) bool {
	quality := map[string]float64{}
	for _, value := range values {
		for part := range strings.SplitSeq(value, ",") {
			name, params, _ := strings.Cut(part, ";")
			q := 1.0
			if params != "" {
				key, value, _ := strings.Cut(strings.TrimSpace(params), "=")
				parsed, err := strconv.ParseFloat(strings.TrimSpace(value), 64)
				if key != "q" || err != nil || !(parsed >= 0 && parsed <= 1) {
					continue
				}
				q = parsed
			}
			quality[strings.ToLower(strings.TrimSpace(name))] = q
		}
	}
	q, ok := quality["gzip"]
	if !ok {
		q = quality["*"]
	}
	return q > 0 && q >= quality["identity"]
}

type compressedWriter struct {
	http.ResponseWriter
	encoder *gzip.Writer
	status  int
}

func (w *compressedWriter) Unwrap() http.ResponseWriter {
	return w.ResponseWriter
}

func (w *compressedWriter) WriteHeader(status int) {
	if w.status != 0 {
		return
	}
	if status < 200 {
		w.ResponseWriter.WriteHeader(status)
		return
	}
	w.status = status
	h := w.Header()
	mime, _, _ := strings.Cut(h.Get("Content-Type"), ";")
	text := strings.HasPrefix(mime, "text/") || mime == "application/json" || mime == "application/javascript" || mime == "application/xml" || strings.HasSuffix(mime, "+json") || strings.HasSuffix(mime, "+xml")
	if text && status != http.StatusNoContent && status != http.StatusNotModified && status != http.StatusPartialContent && h.Get("Content-Encoding") == "" && h.Get("Content-Range") == "" {
		w.encoder = gzip.NewWriter(w.ResponseWriter)
		h.Set("Content-Encoding", "gzip")
		h.Del("Content-Length")
		h.Del("Accept-Ranges")
		if etag := h.Get("ETag"); etag != "" && !strings.HasPrefix(etag, "W/") {
			h.Set("ETag", "W/"+etag)
		}
	}
	w.ResponseWriter.WriteHeader(status)
}

func (w *compressedWriter) Write(p []byte) (int, error) {
	if w.status == 0 {
		if w.Header().Get("Content-Type") == "" {
			w.Header().Set("Content-Type", http.DetectContentType(p))
		}
		w.WriteHeader(http.StatusOK)
	}
	if w.encoder != nil {
		return w.encoder.Write(p)
	}
	return w.ResponseWriter.Write(p)
}

func (w *compressedWriter) Flush() {
	_ = w.FlushError()
}

func (w *compressedWriter) FlushError() error {
	if w.status == 0 {
		w.WriteHeader(http.StatusOK)
	}
	if w.encoder != nil {
		if err := w.encoder.Flush(); err != nil {
			return err
		}
	}
	return http.NewResponseController(w.ResponseWriter).Flush()
}
