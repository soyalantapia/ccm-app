import { describe, it, expect } from 'vitest'
import { cleanStoredUrl } from './url'

describe('cleanStoredUrl — validación de URLs almacenadas (anti stored-XSS / open-redirect)', () => {
  it('acepta http(s)/mailto/tel/relativas', () => {
    expect(cleanStoredUrl('https://maps.google.com/x', 'mapa')).toBe('https://maps.google.com/x')
    expect(cleanStoredUrl('mailto:a@b.com')).toBe('mailto:a@b.com')
    expect(cleanStoredUrl('tel:+549351')).toBe('tel:+549351')
    expect(cleanStoredUrl('/interna')).toBe('/interna')
  })
  it('promueve scheme-less con dominio a https', () => {
    expect(cleanStoredUrl('instagram.com/ccm')).toBe('https://instagram.com/ccm')
  })
  it('RECHAZA esquemas peligrosos (javascript:/data:/vbscript:/file:)', () => {
    for (const bad of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,<script>', 'vbscript:msgbox', 'file:///etc/passwd']) {
      expect(() => cleanStoredUrl(bad, 'campo')).toThrowError()
    }
  })
  it('null/vacío → null', () => {
    expect(cleanStoredUrl(null)).toBeNull()
    expect(cleanStoredUrl('')).toBeNull()
    expect(cleanStoredUrl('   ')).toBeNull()
  })
})
