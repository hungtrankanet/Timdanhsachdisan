// CSV import logic for Lacquer Art Scraper Queue

document.addEventListener('DOMContentLoaded', () => {
  const btnImportCSV = document.getElementById('btn-import-csv');
  const btnDownloadTemplate = document.getElementById('btn-download-template');
  const csvFileInput = document.getElementById('queue-csv-file');

  if (btnImportCSV && csvFileInput) {
    btnImportCSV.addEventListener('click', () => {
      csvFileInput.click();
    });
    csvFileInput.addEventListener('change', handleCSVImport);
  }

  if (btnDownloadTemplate) {
    btnDownloadTemplate.addEventListener('click', downloadCSVTemplate);
  }
});

function downloadCSVTemplate() {
  const csvHeaderAndRows = "keyword,location\r\ntranh sơn mài,\"Quận 1, Hồ Chí Minh\"\r\nxưởng sơn mài,Bình Dương\r\ngốm sứ nghệ thuật,Tràng An\r\n";
  // Add UTF-8 Byte Order Mark (BOM) to ensure Excel opens file with correct Vietnamese encoding
  const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvHeaderAndRows], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "template_hang_doi.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function parseCSVLine(line) {
  const arr = [];
  let quote = false;
  let current = '';
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      quote = !quote;
    } else if ((char === ',' || char === ';') && !quote) {
      arr.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  arr.push(current);
  return arr;
}

async function handleCSVImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function(e) {
    const text = e.target.result;
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const jobs = [];
    
    // Detect header (if any)
    let startIndex = 0;
    if (lines.length > 0) {
      const firstLine = lines[0].toLowerCase();
      if (firstLine.includes('keyword') || firstLine.includes('location') || firstLine.includes('từ khóa') || firstLine.includes('địa điểm')) {
        startIndex = 1;
      }
    }
    
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      const parts = parseCSVLine(line);
      if (parts.length >= 2) {
        const keyword = parts[0].replace(/^["']|["']$/g, '').trim();
        const location = parts[1].replace(/^["']|["']$/g, '').trim();
        if (keyword && location) {
          jobs.push({ keyword, location });
        }
      }
    }

    if (jobs.length === 0) {
      alert('Không tìm thấy dữ liệu hợp lệ trong file CSV. Định dạng đúng là: keyword,location');
      return;
    }

    if (window.showToast) {
      window.showToast(`Đang gửi yêu cầu nhập hàng loạt ${jobs.length} tác vụ...`, 'info');
    } else {
      console.log(`Đang gửi yêu cầu nhập hàng loạt ${jobs.length} tác vụ...`);
    }

    try {
      const res = await fetch('/api/queue/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobs })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Lỗi xử lý từ máy chủ.');
      }

      const result = await res.json();
      const added = result.added || 0;
      const ignored = result.ignored || 0;
      const errors = result.errors || 0;

      if (window.showToast) {
        if (added > 0) {
          window.showToast(`Nhập thành công! Đã thêm: ${added}, Trùng (bỏ qua): ${ignored}${errors > 0 ? `, Lỗi: ${errors}` : ''}`, 'success');
        } else {
          window.showToast(`Không có tác vụ mới nào được thêm. Trùng: ${ignored}${errors > 0 ? `, Lỗi: ${errors}` : ''}`, 'info');
        }
      } else {
        alert(`Nhập thành công! Đã thêm: ${added}, Trùng (bỏ qua): ${ignored}, Lỗi: ${errors}`);
      }
    } catch (err) {
      if (window.showToast) {
        window.showToast(`Lỗi nhập hàng loạt: ${err.message}`, 'error');
      } else {
        alert(`Lỗi nhập hàng loạt: ${err.message}`);
      }
    }

    if (window.loadQueue) {
      window.loadQueue();
    }
    
    // Reset file input value so it can be re-selected
    event.target.value = '';
  };
  reader.readAsText(file, 'UTF-8');
}
