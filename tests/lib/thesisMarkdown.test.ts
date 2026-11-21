// @vitest-environment jsdom

import Bold from '@tiptap/extension-bold'
import BulletList from '@tiptap/extension-bullet-list'
import Code from '@tiptap/extension-code'
import Document from '@tiptap/extension-document'
import Heading from '@tiptap/extension-heading'
import Italic from '@tiptap/extension-italic'
import ListItem from '@tiptap/extension-list-item'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { Editor } from '@tiptap/core'
import { describe, expect, it, afterEach } from 'vitest'
import { Markdown } from 'tiptap-markdown'

function buildThesisEditor(content: string): Editor {
  return new Editor({
    extensions: [
      Document,
      Paragraph,
      Text,
      Bold,
      Italic,
      Code,
      BulletList,
      ListItem,
      Heading.configure({ levels: [2, 3] }),
      Markdown.configure({ html: false, bulletListMarker: '-', breaks: false }),
    ],
    content,
  })
}

describe('thesis markdown round-trip', () => {
  const editors: Editor[] = []
  afterEach(() => {
    for (const ed of editors) ed.destroy()
    editors.length = 0
  })

  it('serializes bold and preserves a blank line between paragraphs', () => {
    const ed = buildThesisEditor('**Bold** line\n\nSecond line')
    editors.push(ed)
    const md = ed.storage.markdown.getMarkdown()
    expect(md).toContain('**Bold**')
    expect(md).toContain('Second line')
    expect(md).toMatch(/\n\n/)
  })

  it('loads ### headings from storage', () => {
    const ed = buildThesisEditor('### Subsection\n\nBody')
    editors.push(ed)
    expect(ed.storage.markdown.getMarkdown()).toContain('### Subsection')
    expect(ed.getText()).toContain('Subsection')
  })
})