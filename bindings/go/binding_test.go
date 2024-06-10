package tree_sitter_cairo_test

import (
	"testing"

	tree_sitter "github.com/smacker/go-tree-sitter"
	"github.com/tree-sitter/tree-sitter-cairo"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_cairo.Language())
	if language == nil {
		t.Errorf("Error loading Cairo grammar")
	}
}
