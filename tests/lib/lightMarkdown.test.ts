import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LightMarkdown } from '../../src/lib/lightMarkdown'

function renderThesis(source: string): string {
  return renderToStaticMarkup(createElement(LightMarkdown, { source }))
}

describe('LightMarkdown headings and hash lines', () => {
  it('renders # Title as h3 like ##', () => {
    const one = renderThesis('# Title')
    const two = renderThesis('## Title')
    expect(one).toContain('<h3')
    expect(two).toContain('<h3')
    expect(one).toContain('Title')
    expect(one.replace(/\s+/g, ' ')).toBe(two.replace(/\s+/g, ' '))
  })

  it('renders non-heading hash lines as paragraphs', () => {
    expect(renderThesis('#### deep')).toContain('<p')
    expect(renderThesis('#### deep')).toContain('#### deep')
    expect(renderThesis('#tag inline')).toContain('#tag inline')
  })

  it('terminates on mixed hash edge cases', () => {
    const html = renderThesis('# Title\n#tag\n#### x\n\nplain')
    expect(html).toContain('Title')
    expect(html).toContain('#tag')
    expect(html).toContain('#### x')
    expect(html).toContain('plain')
  })
})
