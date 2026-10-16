package office

import "github.com/beevik/etree"

// Text-box stories inside a paragraph are opaque, not extra body paragraphs.
func bodyParagraphElements(root *etree.Element) []*etree.Element {
	var out []*etree.Element
	if root == nil {
		return out
	}
	for _, c := range root.ChildElements() {
		if c.NamespaceURI() != W {
			continue
		}
		if c.Tag == "p" {
			out = append(out, c)
		} else {
			out = append(out, bodyParagraphElements(c)...)
		}
	}
	return out
}
