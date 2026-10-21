package office

// RefreshSourceMetadata upgrades imported drafts while preserving their edited text.
func RefreshSourceMetadata(m Model, source Model) Model {
	originals := map[string]*Paragraph{}
	for _, p := range source.Paragraphs() {
		originals[p.ID] = p
	}
	for _, p := range m.Paragraphs() {
		if original := originals[p.ID]; original != nil {
			if p.Protected && p.Text == original.Text && len(p.EditableRanges) == 0 {
				p.EditableRanges = original.EditableRanges
				p.FormatLocked = original.FormatLocked
			}
			if p.Prefix != "" {
				p.Prefix = original.Prefix
				p.PrefixFont = original.PrefixFont
				if original.Role == "article" {
					p.Role = original.Role
					p.KeepNext = original.KeepNext
				}
			}
			if original.Bold {
				p.Bold = true
			}
			if p.Align == "right" && (original.Role == "signature" || original.Role == "date") {
				p.Role = original.Role
				p.KeepNext = original.KeepNext
			}
			if p.BorderWidth == 0 {
				p.BorderWidth = original.BorderWidth
			}
		}
	}
	tablesByParagraph := map[string]*Table{}
	cellsByParagraph := map[string]Cell{}
	for _, block := range source.Blocks {
		if block.Table == nil {
			continue
		}
		for _, row := range block.Table.Rows {
			for _, cell := range row.Cells {
				for _, p := range cell.Paragraphs {
					tablesByParagraph[p.ID] = block.Table
					cellsByParagraph[p.ID] = cell
				}
			}
		}
	}
	for _, block := range m.Blocks {
		if block.Table == nil {
			continue
		}
		var original *Table
		for _, row := range block.Table.Rows {
			for _, cell := range row.Cells {
				for _, p := range cell.Paragraphs {
					if candidate := tablesByParagraph[p.ID]; candidate != nil {
						original = candidate
					}
				}
			}
		}
		if original == nil {
			continue
		}
		if block.Table.Align == "" {
			block.Table.Align = original.Align
		}
		if block.Table.Width == 0 {
			block.Table.Width = original.Width
		}
		for ri := range block.Table.Rows {
			for ci := range block.Table.Rows[ri].Cells {
				cell := &block.Table.Rows[ri].Cells[ci]
				if cell.VerticalAlign == "" {
					for _, p := range cell.Paragraphs {
						if prior, ok := cellsByParagraph[p.ID]; ok {
							cell.VerticalAlign = prior.VerticalAlign
							break
						}
					}
				}
			}
		}
	}
	return m
}
