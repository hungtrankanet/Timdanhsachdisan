/**
 * Google Apps Script for syncing lacquer art heritage leads.
 * Paste this in Extension > Apps Script in your Google Sheet, save, and deploy as Web App with:
 * - Execute as: Me
 * - Who has access: Anyone
 */

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sheetName = data.city || "Chưa phân loại";
    
    // Clean sheet name (Google Sheets tab limit is 100 chars and some chars are forbidden, but clean city name is safe)
    sheetName = sheetName.replace(/[\\\/\?\*\[\]]/g, "").substring(0, 30).trim();
    if (!sheetName) sheetName = "Chưa phân loại";
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);
    
    // Create sheet if not exists
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      // Create headers
      sheet.appendRow([
        "Cập nhật cuối", 
        "Tên thương hiệu", 
        "Số điện thoại", 
        "Website", 
        "Facebook", 
        "Địa chỉ chi tiết", 
        "Phường/Xã", 
        "Quận/Huyện", 
        "Thành phố/Tỉnh", 
        "Trạng thái xác thực", 
        "Trạng thái Zalo"
      ]);
      // Format headers
      var headerRange = sheet.getRange(1, 1, 1, 11);
      headerRange.setBackground("#3E2723"); // Deep dark brown theme (lacquer art theme)
      headerRange.setFontColor("#FFFFFF");
      headerRange.setFontWeight("bold");
      sheet.setFrozenRows(1);
    }
    
    var phone = data.phone ? String(data.phone).trim() : "";
    var existingRow = -1;
    
    // Check if phone number already exists to update it
    if (phone) {
      var lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        var phoneValues = sheet.getRange(2, 3, lastRow - 1, 1).getValues();
        for (var i = 0; i < phoneValues.length; i++) {
          if (String(phoneValues[i][0]).trim() === phone) {
            existingRow = i + 2; // 1-indexed, and skip header
            break;
          }
        }
      }
    }
    
    var rowData = [
      data.timestamp || new Date().toISOString(),
      data.brand_name || "",
      phone,
      data.website || "",
      data.facebook || "",
      data.address || "",
      data.ward || "",
      data.district || "",
      data.city || "",
      data.verification_status || "unverified",
      data.zalo_status || "pending"
    ];
    
    if (existingRow !== -1) {
      // Update existing row
      sheet.getRange(existingRow, 1, 1, 11).setValues([rowData]);
    } else {
      // Append new row
      sheet.appendRow(rowData);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "Lead synchronized successfully",
      action: existingRow !== -1 ? "update" : "insert",
      sheet: sheetName
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
