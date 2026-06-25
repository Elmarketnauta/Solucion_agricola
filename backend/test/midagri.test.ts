// Developed by Marketnauta
// ============================================================================
// Pruebas del adaptador MIDAGRI/PPA en modo STUB. Verifican el contrato estable
// contra el que se desarrolla el scoring mientras no haya convenio con MIDAGRI:
// validación de DNI, determinismo y la regla de "no registrado".
// ============================================================================
import { describe, it, expect } from 'vitest';
import { MidagriService } from '../src/services/midagri.service';

describe('MidagriService.lookupPadron (stub)', () => {
  it('rechaza DNIs que no tengan exactamente 8 dígitos', async () => {
    await expect(MidagriService.lookupPadron('abc')).rejects.toThrow(/8 dígitos/i);
    await expect(MidagriService.lookupPadron('123')).rejects.toThrow(/8 dígitos/i);
    await expect(MidagriService.lookupPadron('123456789')).rejects.toThrow(/8 dígitos/i);
  });

  it('un DNI terminado en 0 o 1 se considera NO registrado en el padrón', async () => {
    const r0 = await MidagriService.lookupPadron('12345670');
    const r1 = await MidagriService.lookupPadron('12345671');
    expect(r0.exists).toBe(false);
    expect(r1.exists).toBe(false);
  });

  it('un DNI registrado devuelve identidad + tenencia coherentes', async () => {
    const r = await MidagriService.lookupPadron('12345678');
    expect(r.exists).toBe(true);
    expect(r.ppaCode).toMatch(/^PPA-/);
    expect(r.hectares).toBeGreaterThan(0);
    expect(r.region).toBeTruthy();
    expect(r.mainCrop).toBeTruthy();
  });

  it('es DETERMINISTA: el mismo DNI da siempre el mismo resultado', async () => {
    const a = await MidagriService.lookupPadron('45678923');
    const b = await MidagriService.lookupPadron('45678923');
    expect(a).toEqual(b);
  });

  it('las hectáreas caen en el rango de minifundio (0.5–8 ha)', async () => {
    for (const dni of ['33333332', '44444443', '55555554', '66666665']) {
      const r = await MidagriService.lookupPadron(dni);
      if (r.exists) {
        expect(r.hectares!).toBeGreaterThanOrEqual(0.5);
        expect(r.hectares!).toBeLessThanOrEqual(8.5);
      }
    }
  });
});
