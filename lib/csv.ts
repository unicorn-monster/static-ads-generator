// Parse the FIRST column of each CSV record into a list of prompts.
// RFC-4180-ish: quote-aware, supports "" escaped quotes, commas and newlines
// inside quoted cells, and CRLF/LF endings. Built for Google Sheets / Excel
// exports where each prompt sits in column A of its own row.

export function parsePromptsFromCsv(text: string): string[] {
  const records = firstColumnOfEachRecord(text.replace(/^﻿/, "")); // strip BOM (Excel)
  // Drop a leading header cell named exactly "prompt"/"prompts".
  if (records.length > 0) {
    const head = records[0].trim().toLowerCase();
    if (head === "prompt" || head === "prompts") records.shift();
  }
  return records.map((c) => c.trim()).filter((c) => c.length > 0);
}

// Walk the text once as a state machine, collecting field[0] of every record.
function firstColumnOfEachRecord(text: string): string[] {
  const out: string[] = [];
  let field = ""; // accumulates the first field of the current record
  let col = 0; // current column index within the record (only col 0 is kept)
  let inQuotes = false;
  let started = false; // anything consumed since the last record break?

  const pushRecord = () => {
    out.push(field);
    field = "";
    col = 0;
    started = false;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          if (col === 0) field += '"'; // escaped quote -> literal "
          i++;
        } else {
          inQuotes = false;
        }
      } else if (col === 0) {
        field += ch; // commas / newlines inside quotes are literal
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      started = true;
    } else if (ch === ",") {
      col++; // move past column 0; later columns are ignored
      started = true;
    } else if (ch === "\n") {
      pushRecord();
    } else if (ch !== "\r") {
      if (col === 0) field += ch;
      started = true;
    }
  }
  if (started || field.length > 0) pushRecord(); // flush record not ended by \n
  return out;
}
