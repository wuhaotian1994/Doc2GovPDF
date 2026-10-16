package office

import (
	"fmt"
	"github.com/beevik/etree"
	"strings"
	"time"
)

type TextRange struct {
	Start int `json:"start"`
	End   int `json:"end"`
}
type runGroup struct {
	start, end int
	nodes      []*etree.Element
}

func rebaseEditableRanges(p Paragraph, next string) ([]TextRange, error) {
	var result []TextRange
	oldCursor, newCursor := 0, 0
	for i, r := range p.EditableRanges {
		prefix := p.Text[oldCursor:r.Start]
		if !strings.HasPrefix(next[newCursor:], prefix) {
			return nil, fmt.Errorf("受保护内容发生变化")
		}
		newCursor += len(prefix)
		start := newCursor
		end := len(p.Text)
		if i+1 < len(p.EditableRanges) {
			end = p.EditableRanges[i+1].Start
		}
		anchor := p.Text[r.End:end]
		stop := len(next)
		if anchor != "" {
			n := strings.Index(next[newCursor:], anchor)
			if n < 0 {
				return nil, fmt.Errorf("受保护内容发生变化")
			}
			stop = newCursor + n
		}
		result = append(result, TextRange{start, stop})
		newCursor = stop
		oldCursor = r.End
	}
	return result, nil
}

func visibleElementText(e *etree.Element) string {
	if e.NamespaceURI() != W {
		return ""
	}
	switch e.Tag {
	case "pPr", "rPr", "del", "moveFrom", "drawing", "pict", "object":
		return ""
	case "t":
		return e.Text()
	case "tab":
		return "\t"
	case "br", "cr":
		if attr(e, "type") == "page" {
			return ""
		}
		return "\n"
	}
	var s strings.Builder
	for _, c := range e.ChildElements() {
		s.WriteString(visibleElementText(c))
	}
	return s.String()
}
func simpleEditableRun(e *etree.Element) bool {
	if e.Tag != "r" || e.NamespaceURI() != W {
		return false
	}
	for _, change := range descendants(e, "rPrChange") {
		if attr(change, "author") != "Doc2GovPDF" {
			return false
		}
	}
	for _, c := range e.ChildElements() {
		switch c.Tag {
		case "rPr", "t", "tab", "cr":
		case "br":
			if attr(c, "type") == "page" {
				return false
			}
		default:
			return false
		}
	}
	return true
}
func editableRunGroups(para *etree.Element) []runGroup {
	var groups []runGroup
	cursor := 0
	contiguous := false
	for _, c := range para.ChildElements() {
		s := visibleElementText(c)
		if simpleEditableRun(c) && s != "" {
			if contiguous {
				g := &groups[len(groups)-1]
				g.end += len(s)
				g.nodes = append(g.nodes, c)
			} else {
				groups = append(groups, runGroup{cursor, cursor + len(s), []*etree.Element{c}})
			}
			contiguous = true
		} else if c.Tag != "pPr" {
			contiguous = false
		}
		cursor += len(s)
	}
	// Zero-width opaque markers can make a textual boundary ambiguous. Keep that
	// paragraph read-only rather than guessing where an edit belongs.
	for i := 1; i < len(groups); i++ {
		if groups[i-1].end == groups[i].start {
			return nil
		}
	}
	return groups
}
func rewriteProtectedText(para *etree.Element, old, next string, tracked bool, id func() string) error {
	groups := editableRunGroups(para)
	if len(groups) == 0 {
		return fmt.Errorf("此段无法安全修改，请保留原文")
	}
	oldCursor, newCursor := 0, 0
	replacements := make([]string, len(groups))
	for i, g := range groups {
		prefix := old[oldCursor:g.start]
		if !strings.HasPrefix(next[newCursor:], prefix) {
			return fmt.Errorf("修改触及受保护的原有对象")
		}
		newCursor += len(prefix)
		end := len(old)
		if i+1 < len(groups) {
			end = groups[i+1].start
		}
		anchor := old[g.end:end]
		stop := len(next)
		if anchor != "" {
			offset := strings.Index(next[newCursor:], anchor)
			if offset < 0 {
				return fmt.Errorf("修改触及超链接、域或旧修订")
			}
			stop = newCursor + offset
		}
		replacements[i] = next[newCursor:stop]
		newCursor = stop
		oldCursor = g.end
	}
	if next[newCursor:] != old[oldCursor:] {
		return fmt.Errorf("段落受保护尾部已变化")
	}
	for i, g := range groups {
		replacement := replacements[i]
		if replacement == old[g.start:g.end] {
			continue
		}
		at := g.nodes[0].Index()
		var props *etree.Element
		if p := child(g.nodes[0], "rPr"); p != nil {
			props = p.Copy()
		}
		for _, n := range g.nodes {
			para.RemoveChild(n)
		}
		if tracked {
			stripOwnRunHistory(props)
			del := etree.NewElement("w:del")
			del.CreateAttr("w:id", id())
			del.CreateAttr("w:author", "Doc2GovPDF")
			del.CreateAttr("w:date", time.Now().UTC().Format(time.RFC3339))
			para.InsertChildAt(at, del)
			for _, n := range g.nodes {
				del.AddChild(n)
				for _, text := range descendants(n, "t") {
					text.Tag = "delText"
				}
			}
			at++
			ins := etree.NewElement("w:ins")
			ins.CreateAttr("w:id", id())
			ins.CreateAttr("w:author", "Doc2GovPDF")
			ins.CreateAttr("w:date", time.Now().UTC().Format(time.RFC3339))
			addRun(ins, replacement, props)
			para.InsertChildAt(at, ins)
		} else {
			holder := etree.NewElement("w:p")
			addRun(holder, replacement, props)
			for _, n := range holder.ChildElements() {
				para.InsertChildAt(at, n.Copy())
				at++
			}
		}
	}
	return nil
}
