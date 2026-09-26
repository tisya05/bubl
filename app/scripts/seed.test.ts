import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseCsv, toSeedBubbles } from './seed'

const HEADER = 'title,note_text,category,latitude,longitude,place_name,media_file,language,author'

function mediaDir(...files: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'bubl-seed-'))
  for (const f of files) writeFileSync(join(dir, f), 'x')
  return dir
}

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, commas and newlines in fields, CRLF and a BOM', () => {
    const csv = '\uFEFFa,b\r\n"one, two","say ""hi""\nthere"\r\n\r\n'
    expect(parseCsv(csv)).toEqual([
      ['a', 'b'],
      ['one, two', 'say "hi"\nthere'],
    ])
  })
})

describe('toSeedBubbles', () => {
  it('builds bubbles with stable seed ids, authors, and defaults', () => {
    const csv = [
      HEADER,
      'The 2 AM slice,"Huge, cheap.",food,40.8036,-73.9645,Broadway & 111th St,slice.jpg,,maya',
      'El mejor atardecer,Ven al atardecer.,Park,40.8095,-73.9687,Riverside Dr,,es,Dev',
      'The 2 AM Slice!,Second one.,Misc,40.75,-73.98,Midtown,,,sam',
    ].join('\n')
    const { bubbles, errors } = toSeedBubbles(csv, mediaDir('slice.jpg'))
    expect(errors).toEqual([])
    expect(bubbles.map((b) => b.id)).toEqual(['seed-the-2-am-slice', 'seed-el-mejor-atardecer', 'seed-the-2-am-slice-2'])
    expect(bubbles[0]).toMatchObject({
      authorId: 'sYL8FvOhT463FM0ZH9ajemFvfXqu7XGo',
      title: 'The 2 AM slice',
      text: 'Huge, cheap.',
      category: 'Food',
      lat: 40.8036,
      lng: -73.9645,
      placeName: 'Broadway & 111th St',
      language: 'en',
      mediaFile: 'slice.jpg',
    })
    expect(bubbles[1]).toMatchObject({ authorId: 'OHHViJa9Fu4tyKzF8ZnRO7OqDgvTm3qx', language: 'es', mediaFile: undefined })
  })

  it('reports every bad row with its row number instead of importing half', () => {
    const csv = [
      HEADER,
      ',no title,Food,40.8,-73.96,Somewhere,,,maya',
      'Swapped,x,Food,-73.96,40.8,Somewhere,,,maya',
      'Bad category,x,Nightlife,40.8,-73.96,Somewhere,,,maya',
      'Unknown author,x,Food,40.8,-73.96,Somewhere,,,bob',
      'Missing file,x,Food,40.8,-73.96,Somewhere,gone.jpg,,maya',
      'HEIC,x,Food,40.8,-73.96,Somewhere,photo.heic,,maya',
    ].join('\n')
    const { bubbles, errors } = toSeedBubbles(csv, mediaDir())
    expect(bubbles).toEqual([])
    expect(errors).toHaveLength(6)
    expect(errors[0]).toMatch(/^Row 2: title is empty/)
    expect(errors[1]).toMatch(/Row 3 \("Swapped"\).*outside NYC/)
    expect(errors[2]).toMatch(/category must be one of/)
    expect(errors[3]).toMatch(/author must be one of maya, dev, sam/)
    expect(errors[4]).toMatch(/gone.jpg is not in seed\/media/)
    expect(errors[5]).toMatch(/export as JPEG/)
  })

  it('names missing columns', () => {
    expect(toSeedBubbles('title,note_text\nx,y', mediaDir()).errors[0]).toMatch(/Missing column\(s\): category/)
  })
})
