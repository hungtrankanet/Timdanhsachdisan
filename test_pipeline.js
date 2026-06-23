import assert from 'assert';
import { run, get, all } from './src/database.js';
import { parseAddress } from './src/scraper.js';
import { normalizePhone, extractPhones, extractFacebookLinks } from './src/verifier.js';

async function runTests() {
  console.log('--- BẮT ĐẦU CHẠY KIỂM THỬ TỰ ĐỘNG ---');
  
  // 1. Test: Address Parser
  console.log('\n1. Đang kiểm tra bộ phân tích địa chỉ (parseAddress)...');
  const addr1 = '123 Đường Cát Linh, Phường Cát Linh, Quận Đống Đa, Hà Nội, Việt Nam';
  const parsed1 = parseAddress(addr1);
  console.log(`Input: "${addr1}" => Phường: "${parsed1.ward}", Quận: "${parsed1.district}", Tỉnh/TP: "${parsed1.city}"`);
  assert.strictEqual(parsed1.city, 'Hà Nội');
  assert.strictEqual(parsed1.district, 'Quận Đống Đa');
  assert.strictEqual(parsed1.ward, 'Phường Cát Linh');

  const addr2 = 'Phú Cát, Quốc Oai, Hà Nội';
  const parsed2 = parseAddress(addr2);
  console.log(`Input: "${addr2}" => Phường: "${parsed2.ward}", Quận: "${parsed2.district}", Tỉnh/TP: "${parsed2.city}"`);
  assert.strictEqual(parsed2.city, 'Hà Nội');
  assert.strictEqual(parsed2.district, 'Quốc Oai');
  assert.strictEqual(parsed2.ward, 'Phú Cát');
  console.log('=> Kiểm tra phân tích địa chỉ: THÀNH CÔNG');

  // 2. Test: Phone Normalization & Extraction
  console.log('\n2. Đang kiểm tra chuẩn hóa và trích xuất số điện thoại...');
  const rawPhone = '+84 901 234 567';
  const normPhone = normalizePhone(rawPhone);
  console.log(`Chuẩn hóa: "${rawPhone}" => "${normPhone}"`);
  assert.strictEqual(normPhone, '0901234567');

  const sampleText = 'Liên hệ với chúng tôi qua số điện thoại 090.123.4567 hoặc hotline +84912345678 để được tư vấn.';
  const extracted = extractPhones(sampleText);
  console.log(`Trích xuất từ: "${sampleText}" => [${extracted.join(', ')}]`);
  assert.ok(extracted.includes('0901234567'));
  assert.ok(extracted.includes('0912345678'));
  console.log('=> Kiểm tra trích xuất SĐT: THÀNH CÔNG');

  // 3. Test: Facebook Link Extraction
  console.log('\n3. Đang kiểm tra trích xuất link Facebook...');
  const sampleHtml = `
    <div>
      <a href="https://www.facebook.com/myartlacquer">Fanpage</a>
      <a href="https://facebook.com/sharer/sharer.php?u=abc">Share link</a>
      <a href="https://www.facebook.com/otherpage/photos/">Photos</a>
    </div>
  `;
  const fbLinks = extractFacebookLinks(sampleHtml);
  console.log(`Trích xuất fb links: [${fbLinks.join(', ')}]`);
  assert.ok(fbLinks.includes('https://www.facebook.com/myartlacquer'));
  assert.ok(!fbLinks.includes('https://facebook.com/sharer/sharer.php?u=abc'));
  console.log('=> Kiểm tra trích xuất Facebook: THÀNH CÔNG');

  // 4. Test: Database Operations
  console.log('\n4. Đang kiểm tra tương tác cơ sở dữ liệu (SQLite)...');
  const testBrand = `Test Artisan ${Date.now()}`;
  const testPhone = `0999${Math.floor(100000 + Math.random() * 900000)}`;
  
  // Insert
  const insertResult = await run(
    `INSERT INTO leads (brand_name, phone, website, address, ward, district, city, verification_status, zalo_status) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [testBrand, testPhone, 'https://testartisan.vn', '123 Test Street, Ward A, District B, City C', 'Ward A', 'District B', 'City C', 'unverified', 'pending']
  );
  console.log(`Đã chèn lead test với ID: ${insertResult.id}`);
  assert.ok(insertResult.id > 0);

  // Retrieve
  const retrieved = await get('SELECT * FROM leads WHERE id = ?', [insertResult.id]);
  console.log(`Đã truy vấn lead ID ${insertResult.id}. Tên thương hiệu: "${retrieved.brand_name}"`);
  assert.strictEqual(retrieved.brand_name, testBrand);
  assert.strictEqual(retrieved.phone, testPhone);

  // Update
  await run('UPDATE leads SET verification_status = "verified" WHERE id = ?', [insertResult.id]);
  const updated = await get('SELECT * FROM leads WHERE id = ?', [insertResult.id]);
  console.log(`Đã cập nhật trạng thái xác thực: "${updated.verification_status}"`);
  assert.strictEqual(updated.verification_status, 'verified');

  // Cleanup test lead
  await run('DELETE FROM leads WHERE id = ?', [insertResult.id]);
  const deleted = await get('SELECT * FROM leads WHERE id = ?', [insertResult.id]);
  assert.strictEqual(deleted, undefined);
  console.log('=> Kiểm tra cơ sở dữ liệu: THÀNH CÔNG');

  console.log('\n--- TẤT CẢ CÁC BÀI KIỂM THỬ ĐÃ THÀNH CÔNG! ---');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n Kiểm thử THẤT BẠI:', err);
  process.exit(1);
});
