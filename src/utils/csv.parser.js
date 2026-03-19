const { parse } = require("csv-parse/sync");
const { normalizePhoneNumber } = require("./phone");

function isHeaderRow(row) {
  if (!Array.isArray(row)) {
    return false;
  }

  const normalized = row.map((value) => String(value || "").trim().toLowerCase());
  return normalized[0] === "phone";
}

function getParamColumnIndexes(headerRow) {
  return headerRow.reduce((indexes, value, index) => {
    const normalized = String(value || "").trim().toLowerCase();

    if (/^param\d+$/.test(normalized)) {
      indexes.push(index);
    }

    return indexes;
  }, []);
}

function parseCampaignCsvFile(content) {
  const records = parse(content, {
    skip_empty_lines: true,
    trim: true,
    bom: true
  });

  if (!records.length) {
    return {
      total: 0,
      validRows: [],
      invalidRows: []
    };
  }

  const hasHeaderRow = isHeaderRow(records[0]);
  const paramColumnIndexes = hasHeaderRow
    ? getParamColumnIndexes(records[0])
    : records[0].slice(1).map((value, index) => index + 1);
  const rows = hasHeaderRow ? records.slice(1) : records;
  const validRows = [];
  const invalidRows = [];

  rows.forEach((row, index) => {
    const rowNumber = hasHeaderRow ? index + 2 : index + 1;
    const rawPhone = row[0];
    const phone = normalizePhoneNumber(rawPhone);
    const params = paramColumnIndexes.map((columnIndex) => {
      const value = row[columnIndex];
      return value === undefined || value === null ? "" : String(value);
    });

    if (!phone) {
      invalidRows.push({
        row: rowNumber,
        phone: rawPhone,
        params,
        reason: "Invalid phone number"
      });
      return;
    }

    validRows.push({
      phone,
      params
    });
  });

  return {
    total: rows.length,
    validRows,
    invalidRows
  };
}

module.exports = {
  parseCampaignCsvFile
};
