// Example: fillable AI vendor questionnaire using pdf-lib
// Canonical local-only generator pattern for complex AcroForm layouts.
// Sourced from the healthcare AI questionnaire workstream.

export { };
// See tmp/generate-fillable-questionnaire.mjs for the actively iterated copy.
// This example is kept in the skill so future sessions have a reusable baseline.

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { writeFileSync } from 'fs';

const PAGE_W  = 612;
const PAGE_H  = 792;
const MARGIN_L = 48;
const MARGIN_R = 48;
const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;
const FOOTER_H  = 36;
const SAFE_BOTTOM = FOOTER_H + 10;

const DARK  = rgb(0.102, 0.102, 0.18);
const BLUE  = rgb(0.18,  0.32,  0.78);
const MID   = rgb(0.42,  0.45,  0.52);
const HINT  = MID;
const LGRAY = rgb(0.82,  0.84,  0.87);
const BGFLD = rgb(0.985, 0.987, 0.992);

let doc, form, page, y;
let helvetica, helveticaBold;

function newPage() {
  page = doc.addPage([PAGE_W, PAGE_H]);
  y = PAGE_H - 48;
  drawFooter(page);
}
function ensureSpace(needed) { if (y - needed < SAFE_BOTTOM) newPage(); }
function drawFooter(pg) {
  pg.drawLine({ start: { x: MARGIN_L, y: 30 }, end: { x: PAGE_W - MARGIN_R, y: 30 }, thickness: 0.5, color: LGRAY });
  pg.drawText('AI Security & Governance Questionnaire v1.0  ·  Confidential', { x: MARGIN_L, y: 18, font: helvetica, size: 7.5, color: rgb(0.72, 0.74, 0.78) });
  pg.drawText('2026', { x: PAGE_W - MARGIN_R - 24, y: 18, font: helvetica, size: 7.5, color: rgb(0.72, 0.74, 0.78) });
}
function sectionHeader(label) {
  ensureSpace(30);
  page.drawRectangle({ x: MARGIN_L, y: y - 5, width: CONTENT_W, height: 17, color: DARK });
  page.drawText(label, { x: MARGIN_L + 8, y: y + 1, font: helveticaBold, size: 8.5, color: rgb(1,1,1) });
  y -= 24;
}
function measureQuestion(text) {
  const words = text.split(' '); const maxW = CONTENT_W - 24; let line = '', lines = 1;
  for (const word of words) { const test = line ? line + ' ' + word : word; if (helveticaBold.widthOfTextAtSize(test, 9) > maxW && line) { lines++; line = word; } else line = test; }
  return lines * 13 + 6;
}
function drawQuestion(num, text) {
  const h = measureQuestion(text); ensureSpace(h + 4);
  page.drawText(num, { x: MARGIN_L, y, font: helveticaBold, size: 8.5, color: BLUE });
  const words = text.split(' '); const maxW = CONTENT_W - 24; let line = '', ly = y;
  for (const word of words) { const test = line ? line + ' ' + word : word; if (helveticaBold.widthOfTextAtSize(test, 9) > maxW && line) { page.drawText(line, { x: MARGIN_L + 24, y: ly, font: helveticaBold, size: 9, color: DARK }); ly -= 13; line = word; } else line = test; }
  if (line) page.drawText(line, { x: MARGIN_L + 24, y: ly, font: helveticaBold, size: 9, color: DARK });
  y = ly - 14;
}
function drawHint(text) { ensureSpace(13); page.drawText(text, { x: MARGIN_L + 24, y, font: helvetica, size: 7.5, color: HINT }); y -= 13; }
function textBox(name, width, height) {
  ensureSpace(height + 6);
  const f = form.createTextField(name);
  f.addToPage(page, { x: MARGIN_L + 24, y: y - height, width, height, borderColor: LGRAY, backgroundColor: BGFLD, borderWidth: 0.5 });
  f.setFontSize(9);
  if (height > 16) f.enableMultiline();
  y -= height + 8;
}
function checkRow(items, indentX = MARGIN_L + 24) {
  let cx = indentX;
  for (const [name, label] of items) {
    const lw = helvetica.widthOfTextAtSize(label, 8.5); const itemW = 10 + 4 + lw + 14;
    if (cx + itemW > PAGE_W - MARGIN_R + 4 && cx > indentX) { cx = indentX; y -= 14; }
    ensureSpace(16);
    const cb = form.createCheckBox(name);
    cb.addToPage(page, { x: cx, y: y - 9, width: 10, height: 10, borderColor: LGRAY, backgroundColor: rgb(1,1,1), borderWidth: 1 });
    page.drawText(label, { x: cx + 14, y: y - 7, font: helvetica, size: 8.5, color: rgb(0.22, 0.24, 0.31) });
    cx += itemW;
  }
  y -= 16;
}
function checkList(items) {
  for (const [name, label] of items) {
    ensureSpace(15);
    const cb = form.createCheckBox(name);
    cb.addToPage(page, { x: MARGIN_L + 24, y: y - 9, width: 10, height: 10, borderColor: LGRAY, backgroundColor: rgb(1,1,1), borderWidth: 1 });
    page.drawText(label, { x: MARGIN_L + 38, y: y - 7, font: helvetica, size: 8.5, color: rgb(0.22, 0.24, 0.31) });
    y -= 14;
  }
  y -= 2;
}
function inlineFieldRow(name, labelText, opts = {}) {
  const fontSize = opts.fontSize ?? 8, labelDy = opts.labelDy ?? -3, lineDy = opts.lineDy ?? -4, fieldDy = opts.fieldDy ?? -16, fieldH = opts.fieldH ?? 14, after = opts.after ?? 22, startX = opts.x ?? (MARGIN_L + 24), labelGap = opts.labelGap ?? 8, minFieldW = opts.minFieldW ?? 90;
  ensureSpace(after);
  page.drawText(labelText, { x: startX, y: y + labelDy, font: helvetica, size: fontSize, color: MID });
  const lw = helvetica.widthOfTextAtSize(labelText, fontSize) + labelGap;
  const fx = startX + lw; const fw = Math.max(minFieldW, PAGE_W - MARGIN_R - fx);
  page.drawLine({ start: { x: fx, y: y + lineDy }, end: { x: fx + fw, y: y + lineDy }, thickness: 0.5, color: LGRAY });
  const f = form.createTextField(name);
  f.addToPage(page, { x: fx, y: y + fieldDy, width: fw, height: fieldH, borderColor: LGRAY, backgroundColor: BGFLD, borderWidth: 0 });
  f.setFontSize(9); y -= after;
}
function inlineLabeledField(name, labelText, fieldX, fieldW, opts = {}) {
  const labelY = opts.labelY ?? (y - 3), lineY = opts.lineY ?? (y - 5), fieldY = opts.fieldY ?? (y - 16), fieldH = opts.fieldH ?? 14, fontSize = opts.fontSize ?? 8, after = opts.after ?? 22;
  ensureSpace(after);
  page.drawText(labelText, { x: MARGIN_L + 24, y: labelY, font: helvetica, size: fontSize, color: MID });
  page.drawLine({ start: { x: fieldX, y: lineY }, end: { x: fieldX + fieldW, y: lineY }, thickness: 0.5, color: LGRAY });
  const f = form.createTextField(name);
  f.addToPage(page, { x: fieldX, y: fieldY, width: fieldW, height: fieldH, borderColor: LGRAY, backgroundColor: BGFLD, borderWidth: 0 });
  f.setFontSize(9); y -= after;
}
function spacer(n = 10) { y -= n; }

async function build(outPath = './AI_Vendor_Questionnaire_example_fillable.pdf') {
  doc = await PDFDocument.create(); form = doc.getForm();
  helvetica = await doc.embedFont(StandardFonts.Helvetica);
  helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);
  page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - 32; drawFooter(page);
  page.drawLine({ start: { x: MARGIN_L, y }, end: { x: PAGE_W - MARGIN_R, y }, thickness: 2.5, color: DARK });
  y -= 16; page.drawText('VENDOR ASSESSMENT · CONFIDENTIAL', { x: MARGIN_L, y, font: helvetica, size: 7.5, color: MID });
  y -= 17; page.drawText('AI Security & Governance Questionnaire', { x: MARGIN_L, y, font: helveticaBold, size: 17, color: DARK });
  y -= 14; page.drawText('Version 1.0  ·  2026', { x: MARGIN_L, y, font: helvetica, size: 8, color: MID });
  page.drawText('Confidential — Do not distribute', { x: PAGE_W - MARGIN_R - 152, y, font: helvetica, size: 7.5, color: MID });
  y -= 14; page.drawLine({ start: { x: MARGIN_L, y }, end: { x: PAGE_W - MARGIN_R, y }, thickness: 0.5, color: LGRAY }); y -= 12;
  const stripH = 42; page.drawRectangle({ x: MARGIN_L, y: y - stripH + 8, width: CONTENT_W, height: stripH, color: rgb(0.974, 0.977, 0.984), borderWidth: 0.5, borderColor: LGRAY });
  const col = (CONTENT_W - 32) / 3;
  for (const [name, label, x] of [['vendor_name','Company / Vendor Name',MARGIN_L + 8],['product_name','Product Name',MARGIN_L + 8 + col + 16],['date_submitted','Date Submitted',MARGIN_L + 8 + (col + 16) * 2]]) {
    page.drawText(label.toUpperCase(), { x, y: y - 2, font: helvetica, size: 7, color: MID });
    page.drawLine({ start: { x, y: y - 16 }, end: { x: x + col - 8, y: y - 16 }, thickness: 0.5, color: LGRAY });
    const f = form.createTextField(name); f.addToPage(page, { x, y: y - 30, width: col - 8, height: 14, borderColor: LGRAY, backgroundColor: rgb(0.974, 0.977, 0.984), borderWidth: 0 }); f.setFontSize(9);
  }
  y -= stripH + 10;
  spacer(60); sectionHeader('Part 1  ·  Scope & Use Case');
  drawQuestion('1', 'Briefly describe what your product uses AI for.'); textBox('q1_ai_description', CONTENT_W - 24, 36); spacer(4);
  drawQuestion('2', 'Which data categories does your product process or have access to? (Select all that apply)'); checkRow([['q2_phi','Protected Health Information (PHI)'],['q2_pii','Personally Identifiable Information (PII)'],['q2_payment','Payment / Financial data'],['q2_employee','Employee or HR data'],['q2_candidate','Job candidate / applicant data'],['q2_none','No personal or sensitive data']]); inlineFieldRow('q2_other', 'If other, please describe:'); spacer(4);
  drawQuestion('3', 'What is the decision impact of the AI outputs in your product?'); checkList([['q3_info','Informational only — no direct action taken'],['q3_human','Suggestions reviewed by a human before any action'],['q3_partial','Partially automated — human can review and override'],['q3_full','Fully automated — AI acts without human review']]); spacer(4);
  drawQuestion('4', 'What level of integration does this product have with customer systems? (Select all that apply)'); checkRow([['q4_standalone','Standalone / no integration'],['q4_sso','SSO / identity only'],['q4_readonly','Read-only API or data access'],['q4_readwrite','Read/write API access'],['q4_ehr','EHR or clinical system integration'],['q4_hris','HRIS / ATS integration']]); spacer(20);
  sectionHeader('Part 2  ·  AI Model & Providers');
  drawQuestion('5', 'Which AI model(s) and provider(s) does your product use?'); drawHint('Include model family and version where known. List all providers involved in delivering AI features.'); textBox('q5_models', CONTENT_W - 24, 36); spacer(4);
  drawQuestion('6', 'How are customers informed of changes to the underlying AI model or provider?'); checkList([['q6_advance','Advance notice provided'],['q6_after','Notification sent after the change'],['q6_none','No formal notification process']]); inlineLabeledField('q6_notice_period', 'Typical notice period:', MARGIN_L + 155, 120, { labelY: y - 4, lineY: y - 6, fieldY: y - 17, after: 26 }); spacer(6);
  newPage();
  drawQuestion('7', 'Is customer data used to train, fine-tune, or improve any AI model — yours or your provider\'s?'); checkList([['q7_no_contract','No — contractually prohibited with all providers'],['q7_no_default','No by default — customer may opt in'],['q7_yes_consent','Yes — with customer consent'],['q7_yes_standard','Yes — standard practice'],['q7_unknown','Unknown / not confirmed with our provider']]); spacer(4);
  drawQuestion('8', 'List any third-party subprocessors that may receive or process customer data as part of this product.'); drawHint('Include LLM providers, cloud platforms, vector databases, and logging or observability tools.'); textBox('q8_subprocessors', CONTENT_W - 24, 36); spacer(20);
  sectionHeader('Part 3  ·  Data Handling & Privacy');
  drawQuestion('9', 'Is customer data encrypted in transit and at rest?'); checkRow([['q9_both','Yes — both in transit and at rest'],['q9_transit','In transit only'],['q9_rest','At rest only'],['q9_no','No']]); inlineFieldRow('q9_standards', 'Standards used (e.g. TLS 1.2+, AES-256):', { labelDy: -4, lineDy: -5, fieldDy: -17, after: 23 }); spacer(4);
  drawQuestion('10', 'Where are customer data, prompts, and AI outputs stored?'); drawHint('Include cloud provider and geographic region.'); textBox('q10_storage', CONTENT_W - 24, 20); spacer(4);
  drawQuestion('11', 'Are required data agreements available for this product? (Select all that apply)'); checkRow([['q11_baa','Business Associate Agreement (BAA)'],['q11_dpa','Data Processing Agreement (DPA)'],['q11_inprogress','In progress / not yet available'],['q11_na','Not applicable']]); spacer(20);
  sectionHeader('Part 4  ·  Security Controls');
  drawQuestion('12', 'What access controls are in place for your product and AI systems? (Select all that apply)'); checkRow([['q12_rbac','Role-based access control (RBAC)'],['q12_mfa','MFA enforced for administrative access'],['q12_sso','SSO support'],['q12_audit','Immutable audit logs']]); inlineFieldRow('q12_other', 'If other, please describe:', { labelDy: -4, lineDy: -5, fieldDy: -17, after: 23 }); spacer(4);
  drawQuestion('13', 'What controls are in place to protect against prompt injection or manipulation of AI outputs? (Select all that apply)'); checkRow([['q13_validation','Input validation and sanitization'],['q13_isolation','System prompt isolation'],['q13_output','Output filtering'],['q13_redteam','Adversarial / red-team testing'],['q13_none','No specific controls currently in place']]); spacer(4);
  drawQuestion('14', 'What third-party security certifications or attestations does your product hold? (Select all that apply)'); checkRow([['q14_soc2','SOC 2 Type II'],['q14_iso27001','ISO 27001'],['q14_hitrust','HITRUST'],['q14_pentest','Penetration test within the last 12 months'],['q14_none','None']]); inlineFieldRow('q14_other', 'If in progress or other, please describe:', { labelDy: -4, lineDy: -5, fieldDy: -17, after: 23 }); spacer(20);
  sectionHeader('Part 5  ·  Governance & Accountability');
  drawQuestion('15', 'Is there a named person or role accountable for AI risk and governance at your organization?'); ensureSpace(18); { const cb = form.createCheckBox('q15_yes'); cb.addToPage(page, { x: MARGIN_L + 24, y: y - 9, width: 10, height: 10, borderColor: LGRAY, backgroundColor: rgb(1,1,1), borderWidth: 1 }); page.drawText('Yes — Title / role:', { x: MARGIN_L + 38, y: y - 7, font: helvetica, size: 8.5, color: rgb(0.22,0.24,0.31) }); const roleX = MARGIN_L + 145; page.drawLine({ start: { x: roleX, y: y - 8 }, end: { x: roleX + 180, y: y - 8 }, thickness: 0.5, color: LGRAY }); const rf = form.createTextField('q15_role'); rf.addToPage(page, { x: roleX, y: y - 18, width: 180, height: 14, borderColor: LGRAY, backgroundColor: BGFLD, borderWidth: 0 }); rf.setFontSize(9); y -= 17; }
  checkList([['q15_shared','Shared — no single designated owner'],['q15_none','Not yet assigned']]); spacer(4);
  drawQuestion('16', 'Do you have a documented process for managing changes to your AI system?'); drawHint('e.g., model updates, prompt changes, new data sources or integrations'); checkList([['q16_formal','Yes — formal change management process'],['q16_informal','Informal — handled case by case'],['q16_none','No formal process']]); spacer(4);
  drawQuestion('17', 'Does your incident response process cover AI-specific events?'); drawHint('e.g., data exposure via AI output, model misbehavior, adversarial input'); checkList([['q17_yes','Yes — AI-specific scenarios are documented'],['q17_general','General IR plan exists, not AI-specific'],['q17_none','No documented plan']]); spacer(4);
  drawQuestion('18', 'Do you have any of the following AI governance documents available to share? (Select all that apply)'); checkRow([['q18_ai_gov_policy','AI Governance Policy'],['q18_ai_aup','AI Acceptable Use Policy'],['q18_ai_risk_policy','AI Risk Management Policy'],['q18_model_card','Model Card / AI System Card'],['q18_trust_overview','AI Trust & Safety Overview'],['q18_none','None available at this time']]); ensureSpace(52); page.drawText('Please list what you are attaching or can provide on request:', { x: MARGIN_L + 24, y, font: helvetica, size: 8, color: MID }); y -= 12; textBox('q18_notes', CONTENT_W - 24, 36); spacer(8);
  ensureSpace(80); page.drawLine({ start: { x: MARGIN_L, y }, end: { x: PAGE_W - MARGIN_R, y }, thickness: 1, color: LGRAY }); y -= 14; page.drawText('Certification', { x: MARGIN_L, y, font: helveticaBold, size: 9, color: DARK }); y -= 13; page.drawText('By submitting this questionnaire, the undersigned certifies that the information provided is accurate and complete to the best of their', { x: MARGIN_L, y, font: helvetica, size: 8, color: MID }); y -= 11; page.drawText('knowledge, and that they are authorized to respond on behalf of their organization.', { x: MARGIN_L, y, font: helvetica, size: 8, color: MID }); y -= 20;
  const sigCol = (CONTENT_W - 32) / 3;
  for (const [name, label, x] of [['sig_name','Respondent Name',MARGIN_L],['sig_title','Title / Role',MARGIN_L + sigCol + 16],['sig_email','Email Address',MARGIN_L + (sigCol + 16) * 2]]) { page.drawText(label.toUpperCase(), { x, y, font: helvetica, size: 7, color: MID }); page.drawLine({ start: { x, y: y - 14 }, end: { x: x + sigCol, y: y - 14 }, thickness: 0.5, color: LGRAY }); const f = form.createTextField(name); f.addToPage(page, { x, y: y - 27, width: sigCol, height: 14, borderColor: LGRAY, backgroundColor: BGFLD, borderWidth: 0 }); f.setFontSize(9); }
  const bytes = await doc.save(); writeFileSync(outPath, bytes); console.log(`Saved example form: ${outPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) build(process.argv[2]).catch(console.error);
