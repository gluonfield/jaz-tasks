package mcpapi_test

import (
	"strings"
	"testing"
)

func TestSearchFollowsOpenAIConvention(t *testing.T) {
	session, _ := connect(t)
	type result struct {
		ID    string `json:"id"`
		Title string `json:"title"`
		URL   string `json:"url"`
		Text  string `json:"text"`
		Meta  struct {
			Preview struct {
				Target struct {
					Type      string            `json:"type"`
					Name      string            `json:"name"`
					Arguments map[string]string `json:"arguments"`
				} `json:"target"`
			} `json:"openai/preview"`
		} `json:"_meta"`
	}
	for _, query := range []string{"webhook", "eng-17"} {
		found := call[struct {
			Results []result `json:"results"`
		}](t, session, "search", map[string]any{"query": query})
		var hit result
		for _, r := range found.Results {
			if r.ID == "ENG-17" {
				hit = r
			}
		}
		target := hit.Meta.Preview.Target
		if hit.URL != "http://tasks.test/issue/ENG-17" || hit.Title == "" || !strings.HasPrefix(hit.Text, "ENG-17 · ") || target.Type != "mcp_app_tool" || target.Name != "show_tasks" || target.Arguments["view"] != "ENG-17" {
			t.Fatalf("%q results = %+v", query, found.Results)
		}
	}
}
