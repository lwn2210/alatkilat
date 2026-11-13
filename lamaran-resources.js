/* Bounded header preflight, not a decompression-bomb guarantee. */
(function(root) {
  'use strict';
  const MAX_IMAGE_PIXELS = 25000000;
  const bad = () => { throw new Error('Header gambar rusak atau tidak didukung'); };
  function imageHeader(bytes, type) {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let width, height;
    if (type === 'png') {
      if (bytes.length < 33 || ![137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b) || v.getUint32(8) !== 13 || v.getUint32(12) !== 0x49484452) bad();
      let crc = 0xffffffff;
      for (const b of bytes.subarray(12,29)) {
        crc ^= b;
        for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
      }
      if (((crc ^ 0xffffffff) >>> 0) !== v.getUint32(29)) bad();
      width = v.getUint32(16); height = v.getUint32(20);
      const depths = {0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]};
      if (!depths[bytes[25]]?.includes(bytes[24]) || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] > 1) bad();
    } else if (type === 'jpeg') {
      if (bytes[0] !== 255 || bytes[1] !== 216) bad();
      let pos = 2;
      const end = Math.min(bytes.length, 1024 * 1024);
      while (pos < end) {
        if (bytes[pos++] !== 255) bad();
        while (pos < end && bytes[pos] === 255) pos++;
        if (pos + 3 > end) bad();
        const marker = bytes[pos++];
        if (marker === 0 || marker === 0xda || marker === 0xd9 || marker === 0xd8 || marker === 1 || (marker >= 0xd0 && marker <= 0xd7)) bad();
        const length = v.getUint16(pos);
        if (length < 2 || pos + length > end) bad();
        if ([0xc0,0xc1,0xc2].includes(marker)) {
          if (length < 8 || bytes[pos + 2] !== 8) bad();
          const components = bytes[pos + 7];
          if (![1,3,4].includes(components) || length !== 8 + 3 * components) bad();
          height = v.getUint16(pos + 3); width = v.getUint16(pos + 5);
          break;
        }
        // Other coding modes are deliberately unsupported rather than decoded speculatively.
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4,0xc8,0xcc].includes(marker)) bad();
        pos += length;
      }
    } else bad();
    if (!width || !height) bad();
    const pixels = width * height;
    if (!Number.isSafeInteger(pixels) || pixels > MAX_IMAGE_PIXELS) throw new Error('Gambar melebihi 25 megapiksel');
    return {width, height, pixels};
  }
  function newBudget(inputBytes) {
    let used = 0;
    const reserve = bytes => {
      if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('Perhitungan sumber daya tidak valid');
      if (used + bytes > 512 * 1024 * 1024) throw new Error('Anggaran sumber daya 512 MiB terlampaui');
      used += bytes;
    };
    reserve(inputBytes * 2); // Input plus merge/copy allowance, not a heap measurement.
    return {
      get used() { return used; }, reserve,
      image: pixels => reserve(pixels * 12), // Decode, canvas and embed workspaces.
      normalized: bytes => reserve(bytes * 2), // Retained PNG and export copy.
      pdf: (pages, objects, streamBytes) => reserve(pages * 65536 + objects * 1024 + streamBytes)
    };
  }
  const api = {imageHeader, MAX_IMAGE_PIXELS, newBudget};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LamaranResources = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
