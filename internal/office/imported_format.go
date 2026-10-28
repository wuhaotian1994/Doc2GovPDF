package office

import (
	"fmt"
	"github.com/beevik/etree"
	"strings"
)

// Formatting is resolved only for the supported native paragraph/run model.
// Original XML, table/conditional styles and all unrelated package parts stay intact.
type importedFormatting struct {
	styles           map[string]*etree.Element
	defaults         *etree.Element
	defaultParagraph string
	theme            *etree.Element
}

func readImportedFormatting(parts map[string][]byte) importedFormatting {
	f := importedFormatting{styles: readStyles(parts["word/styles.xml"])}
	if d, e := parseXML(parts["word/styles.xml"]); e == nil && d.Root() != nil {
		f.defaults = child(d.Root(), "docDefaults")
		for _, s := range childElements(d.Root(), "style") {
			if (attr(s, "type") == "paragraph" || attr(s, "type") == "") && onValue(attr(s, "default")) {
				f.defaultParagraph = attr(s, "styleId")
			}
		}
	}
	if d, e := parseXML(parts["word/theme/theme1.xml"]); e == nil {
		f.theme = d.Root()
	}
	return f
}
func newImportedProps(tag string) *etree.Element {
	e := etree.NewElement("w:" + tag)
	e.CreateAttr("xmlns:w", W)
	return e
}

// Source producers may use ns0 or a default namespace, not the literal w prefix.
func copyImportedProp(src *etree.Element) *etree.Element {
	tag := src.FullTag()
	uri := src.NamespaceURI()
	if uri == W {
		tag = "w:" + src.Tag
	}
	out := etree.NewElement(tag)
	if uri != "" && uri != W {
		if src.Space != "" {
			out.CreateAttr("xmlns:"+src.Space, uri)
		} else {
			out.CreateAttr("xmlns", uri)
		}
	}
	for _, a := range src.Attr {
		if a.Space == "xmlns" || a.Key == "xmlns" {
			continue
		}
		key := a.FullKey()
		ns := a.NamespaceURI()
		if ns == W {
			key = "w:" + a.Key
		} else if ns != "" && a.Space != "xml" && a.Space != "" {
			out.CreateAttr("xmlns:"+a.Space, ns)
		}
		out.CreateAttr(key, a.Value)
	}
	out.SetText(src.Text())
	for _, c := range src.ChildElements() {
		out.AddChild(copyImportedProp(c))
	}
	return out
}

func onValue(s string) bool { return s == "1" || s == "true" || s == "on" }

// Child attributes (spacing, indentation, rFonts) inherit independently. Direct
// explicit font names override lower-level theme references and vice versa.
func mergeImportedProps(dst, src *etree.Element) {
	if src == nil {
		return
	}
	for _, s := range src.ChildElements() {
		if s.Tag == "rPr" || s.Tag == "pPrChange" || s.Tag == "rPrChange" {
			continue
		}
		d := child(dst, s.Tag)
		if d != nil && (s.Tag == "spacing" || s.Tag == "ind" || s.Tag == "rFonts" || s.Tag == "lang") {
			if s.Tag == "rFonts" {
				for _, pair := range [][2]string{{"eastAsia", "eastAsiaTheme"}, {"ascii", "asciiTheme"}, {"hAnsi", "hAnsiTheme"}, {"cs", "cstheme"}} {
					if attr(s, pair[0]) != "" {
						d.RemoveAttr("w:" + pair[1])
					}
					if attr(s, pair[1]) != "" {
						d.RemoveAttr("w:" + pair[0])
					}
				}
			}
			if s.Tag == "ind" {
				if attr(s, "hanging") != "" || attr(s, "hangingChars") != "" {
					d.RemoveAttr("w:firstLine")
					d.RemoveAttr("w:firstLineChars")
				}
				if attr(s, "firstLine") != "" || attr(s, "firstLineChars") != "" {
					d.RemoveAttr("w:hanging")
					d.RemoveAttr("w:hangingChars")
				}
			}
			for _, a := range s.Attr {
				key := a.FullKey()
				if a.NamespaceURI() == W {
					key = "w:" + a.Key
				}
				d.CreateAttr(key, a.Value)
			}
		} else {
			if d != nil {
				dst.RemoveChild(d)
			}
			dst.AddChild(copyImportedProp(s))
		}
	}
}
func (f importedFormatting) style(id, kind string, pp, rp *etree.Element, seen map[string]bool) {
	if id == "" || seen[id] {
		return
	}
	seen[id] = true
	s := f.styles[id]
	if s == nil {
		return
	}
	t := attr(s, "type")
	if t != "" && t != kind {
		return
	}
	f.style(attr(child(s, "basedOn"), "val"), kind, pp, rp, seen)
	if pp != nil {
		mergeImportedProps(pp, child(s, "pPr"))
	}
	mergeImportedProps(rp, child(s, "rPr"))
}
func (f importedFormatting) paragraph(id string, direct *etree.Element) (*etree.Element, *etree.Element) {
	pp, rp := newImportedProps("pPr"), newImportedProps("rPr")
	mergeImportedProps(pp, child(child(f.defaults, "pPrDefault"), "pPr"))
	mergeImportedProps(rp, child(child(f.defaults, "rPrDefault"), "rPr"))
	if id == "" {
		id = f.defaultParagraph
	}
	f.style(id, "paragraph", pp, rp, map[string]bool{})
	mergeImportedProps(pp, direct)
	f.resolveTheme(rp)
	return pp, rp
}
func (f importedFormatting) run(base, direct *etree.Element) *etree.Element {
	rp := base.Copy()
	f.style(attr(child(direct, "rStyle"), "val"), "character", nil, rp, map[string]bool{})
	mergeImportedProps(rp, direct)
	f.resolveTheme(rp)
	return rp
}
func (f importedFormatting) resolveTheme(rp *etree.Element) {
	fonts := child(rp, "rFonts")
	ref := attr(fonts, "eastAsiaTheme")
	if ref == "" || f.theme == nil {
		return
	}
	kind := "minorFont"
	if strings.HasPrefix(ref, "major") {
		kind = "majorFont"
	}
	var font *etree.Element
	var find func(*etree.Element)
	find = func(e *etree.Element) {
		if e == nil {
			return
		}
		if e.Tag == kind && e.NamespaceURI() == "http://schemas.openxmlformats.org/drawingml/2006/main" {
			font = e
			return
		}
		for _, c := range e.ChildElements() {
			find(c)
		}
	}
	find(f.theme)
	if font == nil {
		return
	}
	script := "Hans"
	lang := attr(child(rp, "lang"), "eastAsia")
	if strings.HasPrefix(lang, "ja") {
		script = "Jpan"
	} else if strings.HasPrefix(lang, "ko") {
		script = "Hang"
	} else if strings.Contains(lang, "TW") || strings.Contains(lang, "HK") {
		script = "Hant"
	}
	name := ""
	for _, c := range font.ChildElements() {
		if c.Tag == "ea" {
			name = attr(c, "typeface")
		}
	}
	if name == "" {
		for _, c := range font.ChildElements() {
			if c.Tag == "font" && attr(c, "script") == script {
				name = attr(c, "typeface")
			}
		}
	}
	if name != "" {
		fonts.CreateAttr("w:eastAsia", name)
	}
}

// With no text run to clone, explicitly materialize the supported insertion
// format. Paragraph-mark formatting alone does not style a new w:r in Word.
func insertionRunProperties(mark *etree.Element, p Paragraph) *etree.Element {
	rp := newImportedProps("rPr")
	if mark != nil {
		rp = copyImportedProp(mark)
		rp.CreateAttr("xmlns:w", W)
	}
	for _, tag := range []string{"rFonts", "sz", "szCs", "b", "bCs", "i", "iCs", "color", "rPrChange", "ins", "del", "moveFrom", "moveTo"} {
		if c := child(rp, tag); c != nil {
			rp.RemoveChild(c)
		}
	}
	fonts := rp.CreateElement("w:rFonts")
	for _, k := range []string{"ascii", "hAnsi", "eastAsia", "cs"} {
		fonts.CreateAttr("w:"+k, p.Font)
	}
	for _, tag := range []string{"sz", "szCs"} {
		rp.CreateElement("w:"+tag).CreateAttr("w:val", fmt.Sprint(int(p.Size*2)))
	}
	for _, v := range []struct {
		tag string
		on  bool
	}{{"b", p.Bold}, {"i", p.Italic}} {
		value := "0"
		if v.on {
			value = "1"
		}
		rp.CreateElement("w:"+v.tag).CreateAttr("w:val", value)
	}
	color := p.Color
	if color == "" {
		color = "000000"
	}
	rp.CreateElement("w:color").CreateAttr("w:val", color)
	return rp
}

// Version-zero snapshots serialized the old reader's implicit values. Compare
// against that reader to distinguish saved edits from new inheritance fixes;
// otherwise an untouched old snapshot would rewrite every original paragraph.
func applyLegacyProps(p *Paragraph, pp, rp *etree.Element) {
	line, italic := p.Line, p.Italic
	applyProps(p, pp, rp)
	if pp != nil && attr(child(pp, "spacing"), "lineRule") != "exact" {
		p.Line = line
	}
	if pp != nil && attr(child(pp, "spacing"), "lineRule") == "exact" && attr(child(pp, "spacing"), "line") == "" {
		p.Line = 579 / 56.6929
	}
	if italic && child(rp, "i") != nil && !enabled(child(rp, "i")) {
		p.Italic = true
	}
	p.LineMultiple = 0
}
