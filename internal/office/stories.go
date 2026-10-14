package office

import (
	"fmt"
	"github.com/beevik/etree"
	"time"
)

func rewriteStory(data []byte, before, after []Paragraph, tracked bool) ([]byte, bool, error) {
	if len(before) != len(after) {
		return nil, false, fmt.Errorf("页眉页脚结构不能直接增删")
	}
	d, e := parseXML(data)
	if e != nil {
		return nil, false, e
	}
	if d.Root() == nil {
		return nil, false, fmt.Errorf("页眉页脚内容缺失")
	}
	nodes := descendants(d.Root(), "p")
	if len(nodes) != len(before) {
		return nil, false, fmt.Errorf("页眉页脚结构无法安全修改")
	}
	nextID := revisionIDs(d.Root())
	changed := false
	for i, p := range after {
		old := before[i]
		if p.Text != old.Text && p.Size >= 22 && p.Align == "center" {
			width := p.FrameWidth
			if width == 0 {
				width = 156
			}
			if e := fitMark(&p, width); e != nil {
				return nil, false, e
			}
		}
		if p.ID != old.ID {
			return nil, false, fmt.Errorf("页眉页脚顺序已改变")
		}
		formatChanged := !sameFormat(p, old)
		if p.Text == old.Text && !formatChanged {
			continue
		}
		if old.Protected {
			return nil, false, fmt.Errorf("页眉页脚中的域、修订或对象必须保留原样")
		}
		changed = true
		node := nodes[i]
		if formatChanged {
			reviseFormat(node, p, tracked, nextID)
		}
		if p.Text == old.Text {
			continue
		}
		var previous []*etree.Element
		var props *etree.Element
		for _, c := range node.ChildElements() {
			if c.Tag == "pPr" {
				continue
			}
			previous = append(previous, c)
			if props == nil && c.Tag == "r" {
				if rp := child(c, "rPr"); rp != nil {
					props = rp.Copy()
				}
			}
		}
		for _, c := range previous {
			node.RemoveChild(c)
		}
		if tracked {
			deleted := node.CreateElement("w:del")
			deleted.CreateAttr("w:id", nextID())
			deleted.CreateAttr("w:author", "Doc2GovPDF")
			deleted.CreateAttr("w:date", time.Now().UTC().Format(time.RFC3339))
			for _, c := range previous {
				for _, text := range descendants(c, "t") {
					text.Tag = "delText"
				}
				deleted.AddChild(c)
			}
			inserted := node.CreateElement("w:ins")
			inserted.CreateAttr("w:id", nextID())
			inserted.CreateAttr("w:author", "Doc2GovPDF")
			inserted.CreateAttr("w:date", time.Now().UTC().Format(time.RFC3339))
			addRun(inserted, p.Text, props)
		} else {
			addRun(node, p.Text, props)
		}
	}
	if !changed {
		return data, false, nil
	}
	d.Root().CreateAttr("xmlns:w", W)
	out, e := d.WriteToBytes()
	return out, true, e
}
