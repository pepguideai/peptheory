// pepcalc — static web app. No build step, no server, no analytics. State lives in memory + localStorage.
(() => {
  const KEY = 'pepcalc.guides', NOTICE_KEY = 'pepcalc.noticeAccepted';
  const LEGAL = {
    terms: { title: 'Terms of use', sections: [
      ['What peptheory.io does', 'peptheory.io performs arithmetic on numbers you type in. It does not verify those numbers, does not know what is in your vial, and does not provide medical, pharmaceutical or dosing advice of any kind.'],
      ['No professional relationship', 'Using peptheory.io does not create a doctor–patient, pharmacist–patient or any other professional relationship. Consult a licensed professional about anything you are unsure of.'],
      ['Your responsibility', 'You are responsible for checking every input and every result before acting on it. You confirm that you are an adult and that you are legally permitted to possess and use whatever you are preparing.'],
      ['Not for emergencies', 'peptheory.io is not designed for emergency use. If you believe you have made an error that could affect your health, contact a medical professional or emergency services immediately.'],
      ['No warranty', 'peptheory.io is provided "as is" without warranties of any kind, express or implied, including accuracy, fitness for a particular purpose and non-infringement. Results may contain errors.'],
      ['Limitation of liability', 'To the fullest extent permitted by law, the makers of peptheory.io are not liable for any loss, injury or damage arising from use of, or reliance on, the app or its results.'],
      ['Changes', 'These terms may change. Continued use after a change means you accept the updated terms.'],
    ] },
    privacy: { title: 'Privacy policy', sections: [
      ['What we collect', 'Nothing. peptheory.io has no account, no analytics and no server. The numbers you enter and the compounds you save are stored only on this device.'],
      ['Where your data lives', 'Saved compounds are kept in this browser\u2019s local storage. Clearing site data, or deleting a compound in the app, removes them. We cannot see or recover them.'],
      ['Sharing', 'When you use Download, the table is rendered on your device and handed to your browser\u2019s print or share sheet. Nothing is sent to us.'],
      ['If this changes', 'If a future version adds sync, accounts or analytics, this policy will be updated first and you will be asked before any data leaves your device.'],
      ['Contact', 'Questions about privacy: tgtechnologies@yahoo.com.'],
    ] },
  };

  let S = { intro: true, step: 0, home: false, mg: '', syringe: 'U-100', water: '', dose: '', doseUnit: 'mg', rstep: 0, custom: false, guideName: '', saved: false, guides: [], injected: 0, pushing: false, savedName: '', undo: null, noticeAccepted: false, legal: null, fromSaved: false };
  let pushT, undoT;
  try { S.guides = JSON.parse(localStorage.getItem(KEY) || '[]'); S.home = S.guides.length > 0; S.noticeAccepted = localStorage.getItem(NOTICE_KEY) === '1'; } catch (e) {}

  const set = (patch) => { Object.assign(S, patch); render(); };
  const persist = (guides) => { try { localStorage.setItem(KEY, JSON.stringify(guides)); } catch (e) {} S.guides = guides; };
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---- math ----
  const fmt = (n, d = 2) => { if (!isFinite(n)) return '—'; const s = n.toFixed(d); return s.includes('.') ? s.replace(/\.?0+$/, '') : s; };
  const units = (u) => fmt(u, 1);
  const isWhole = (u) => { const f = u - Math.floor(u + 1e-9); return f < 0.05 || f > 0.95; };
  const lineText = (u) => {
    if (!isFinite(u) || u < 0) return 'the 0 line';
    const w = Math.floor(u + 1e-9), f = u - w;
    if (f < 0.05) return `the ${w} line`;
    if (f > 0.95) return `the ${w + 1} line`;
    if (Math.abs(f - 0.5) < 0.1) return `halfway between the ${w} and ${w + 1} lines`;
    if (f < 0.5) return `just past the ${w} line`;
    return `just shy of the ${w + 1} line`;
  };
  const lineNote = (u, canEdit) => {
    if (!(u > 0)) return '';
    if (u < 5) return `Under 5 units is a very small draw and hard to read. More water in the vial would give you a bigger, easier draw.${canEdit ? ' Tap Edit numbers to change it.' : ''}`;
    if (!isWhole(u)) return `This doesn't land on a whole line, so it's harder to read exactly.${canEdit ? ' A different amount of water can fix that — tap Edit numbers.' : ''}`;
    return '';
  };
  // One recommended water volume: draw lands on a clean unit line, within one syringe when possible.
  const recommendWater = (mg, doseMg, cap) => {
    if (!(mg > 0) || !(doseMg > 0)) return null;
    let best = null;
    for (const ml of [0.5, 1, 1.5, 2, 2.5, 3, 4, 5]) {
      const u = doseMg * ml / mg * 100; let s = 0;
      if (u < 5 || u > cap) s += 100; else if (u < 10) s += 20;
      if (Math.abs(u - Math.round(u)) > 0.01) s += 30; else if (u % 5 !== 0) s += 8;
      if (ml * 100 > cap) s += 5;
      if (ml % 1 !== 0) s += 3;
      if (!best || s < best.score || (s === best.score && ml < best.ml)) best = { ml, u, score: s };
    }
    return best;
  };

  // ---- derived model ----
  function model() {
    const st = S, step = st.step;
    const isHome = st.home && step === 0 && (st.guides.length > 0 || !!st.undo);
    const isIntro = st.intro && step === 0 && !isHome;
    const inInputs = step < 4 && !isHome && !isIntro, inResult = step === 4;
    const isSavedDose = step === 5, isSavedDraw = step === 6;
    const mg = parseFloat(st.mg), water = parseFloat(st.water), dose = parseFloat(st.dose);
    const valid = [mg > 0, true, dose > 0, water > 0];
    const cap = st.syringe === 'U-100' ? 100 : 50;
    const doseMg = st.doseUnit === 'mcg' ? dose / 1000 : dose;
    const rec = recommendWater(mg, doseMg, cap);
    const matchesOpt = !!rec && rec.ml === water;
    const recU = rec ? rec.u : 0;
    const recFills = (() => { if (!rec) return ''; const wu = rec.ml * 100; if (wu === cap) return `1 full ${st.syringe} syringe`; if (wu > cap) { const f = Math.floor(wu / cap), rem = wu - f * cap; return `${f} full ${st.syringe} syringe${f === 1 ? '' : 's'}${rem > 0.05 ? ' + ' + units(rem) + ' units' : ''}`; } return `${units(wu)} units on a ${st.syringe} syringe`; })();
    const recReason = rec ? (isWhole(recU)
      ? `This puts your ${fmt(dose, 3)} ${st.doseUnit} draw exactly on the ${units(recU)} line. A whole line is the easiest to read.`
      : `Your ${fmt(dose, 3)} ${st.doseUnit} draw lands at ${units(recU)} units. No common amount of water gives a whole line here, so read carefully.`) : '';
    const conc = water > 0 ? mg / water : 0;
    const drawUnits = conc > 0 ? doseMg / conc * 100 : 0;
    const waterUnits = water > 0 ? water * 100 : 0;
    const split = (u) => { if (!(u > cap)) return { fulls: 0, rem: u || 0 }; const fulls = Math.floor(u / cap); return { fulls, rem: u - fulls * cap }; };
    const wS = split(waterUnits), dS = split(drawUnits);
    const nInj = waterUnits <= cap ? 1 : wS.fulls + (wS.rem >= 0.05 ? 1 : 0);
    let s1;
    if (waterUnits <= cap) s1 = `Draw ${units(waterUnits)} units (${fmt(water)} mL) of bacteriostatic water into your syringe.`;
    else if (wS.rem >= 0.05) s1 = `Draw ${cap} units (${fmt(cap / 100)} mL) of bacteriostatic water — a full ${st.syringe} syringe. You'll do this ${wS.fulls} ${wS.fulls === 1 ? 'time' : 'times'}, then ${units(wS.rem)} more units, for ${fmt(water)} mL in total.`;
    else s1 = `Draw ${cap} units (${fmt(cap / 100)} mL) of bacteriostatic water — a full ${st.syringe} syringe. You'll do this ${nInj} times for ${fmt(water)} mL in total.`;
    const s2 = nInj === 1 ? 'Push the water slowly into your compound vial, aiming the stream at the glass wall rather than the powder.' : 'Push the water slowly into your compound vial, aiming at the glass wall. Tap the button below after each one so you don\u2019t lose count.';
    const dFill = Math.min(drawUnits, cap), dl = lineText(dFill);
    const doseWord = `${fmt(dose, 3)} ${st.doseUnit}`;
    const s3 = 'Roll the vial gently between your fingers until the liquid is completely clear with nothing floating in it. Don\u2019t shake it.';
    const s4 = `Now that your compound is properly reconstituted, draw ${units(dFill)} units from the compound vial.`;
    const overNote = dS.fulls ? `That's more than one ${st.syringe} syringe holds (${cap} units). It would take ${dS.fulls} full syringe${dS.fulls === 1 ? '' : 's'}${dS.rem > 0 ? ' plus ' + units(dS.rem) + ' units' : ''}.` : '';
    const drawHow = `Wipe the stopper, turn the vial upside down, and pull the plunger slowly to ${dl}. Check it at eye level; if you see bubbles, tap them to the top, push them back into the vial, and re-draw.`;
    const steps = [
      { n: 1, text: s1, short: 'Water drawn into the syringe', fill: Math.min(waterUnits, cap), note: '' },
      { n: 2, text: s2, short: 'Water injected into the vial', fill: 0, note: '' },
      { n: 3, text: s3, short: 'Mixed until clear', fill: 0, note: '' },
      { n: 4, text: s4, short: `Drawn to ${dl}`, fill: dFill, note: overNote || lineNote(drawUnits, true), how: drawHow },
    ];
    const LAST = 3, r = Math.min(st.rstep, LAST + 2);
    const isReady = r === LAST + 1, isTable = r === LAST + 2;
    const cur = isSavedDraw ? steps[3] : steps[Math.min(r, LAST)];
    const unitsPerMg = conc > 0 ? 100 / conc : 0;
    const tableRows = [];
    if (unitsPerMg > 0) for (let k = 0.5; k <= 5 && tableRows.length < 10; k += 0.5) {
      const amtMg = doseMg * k, u = amtMg * unitsPerMg; if (u > cap) break;
      tableRows.push({ units: units(u), amount: fmt(st.doseUnit === 'mcg' ? amtMg * 1000 : amtMg, 3), base: k === 1 });
    }
    const perUnit = unitsPerMg > 0 ? (1 / unitsPerMg) * (st.doseUnit === 'mcg' ? 1000 : 1) : 0;
    const tableIntro = `With ${fmt(mg)} mg in ${fmt(water)} mL, each unit on your ${st.syringe} syringe is ${fmt(perUnit, 3)} ${st.doseUnit}.`;
    const showTracker = r === 1 && nInj > 1 && inResult;
    const injectedMl = Array.from({ length: Math.min(st.injected, nInj) }, (_, i) => (i === nInj - 1 && wS.rem >= 0.05 ? wS.rem : cap) / 100).reduce((a, b) => a + b, 0);
    const nextInjUnits = st.injected >= nInj ? 0 : ((st.injected === nInj - 1 && wS.rem >= 0.05) ? wS.rem : cap);
    if (showTracker) steps[1].fill = st.pushing ? 0 : nextInjUnits;
    return { st, step, isHome, isIntro, inInputs, inResult, isSavedDose, isSavedDraw, mg, water, dose, valid, cap, rec, matchesOpt, recU, recFills, recReason, drawUnits, waterUnits, wS, nInj, dFill, dl, doseWord, overNote, steps, LAST, r, isReady, isTable, cur, tableRows, tableIntro, showTracker, injectedMl, nextInjUnits };
  }

  // ---- SVG helpers ----
  const syringeSVG = (m, showVialEnd) => {
    const { cap, cur } = m, L = 240, x0 = 300, xFor = (u) => x0 - (u / cap) * L;
    const fillX = xFor(cur.fill), fillW = x0 - fillX, stopperX = fillX - 10, plungerW = Math.max(0, stopperX - 30);
    const label = units(cur.fill) + ' units', labelW = Math.max(60, label.length * 9 + 16), labelX = Math.min(Math.max(fillX - labelW / 2, 0), 340 - labelW);
    const major = cap === 100 ? 10 : 5; let ticks = '';
    for (let u = 0; u <= cap; u += 5) { const x = xFor(u), M = u % major === 0; ticks += `<line x1="${x}" y1="90" x2="${x}" y2="${M ? 104 : 98}" stroke="var(--n600)" stroke-width="${M ? 2.5 : 1.5}" stroke-linecap="round"/>`; if (M && (cap === 50 || u % 20 === 0)) ticks += `<text x="${x}" y="122" text-anchor="middle" font-size="13" font-weight="600" fill="var(--n700)">${u}</text>`; }
    const vial = showVialEnd ? `<g transform="translate(336,65)"><rect x="0" y="-10" width="14" height="20" rx="3" fill="var(--n600)"/><rect x="14" y="-7" width="12" height="14" fill="none" stroke="var(--n700)" stroke-width="3"/><rect x="27.5" y="-21.5" width="34" height="43" rx="6" fill="var(--a300)"/><rect x="26" y="-23" width="58" height="46" rx="9" fill="none" stroke="var(--n700)" stroke-width="3"/><text x="55" y="44" text-anchor="middle" fill="var(--n500)" font-size="11" font-weight="600">vial, upside down</text></g>` : '';
    const line = cur.fill > 0 ? `<line class="anim" x1="${fillX}" y1="30" x2="${fillX}" y2="100" stroke="var(--accent)" stroke-width="4" stroke-linecap="round"/><rect class="anim" x="${labelX}" y="8" width="${labelW}" height="24" rx="12" fill="var(--accent)"/><text class="anim" x="${fillX}" y="25" text-anchor="middle" fill="var(--bg)" font-size="15" font-weight="700">${label}</text>` : '';
    return `<div class="diagram"><svg viewBox="0 0 ${showVialEnd ? 424 : 340} 150" font-family="Figtree, sans-serif">
<rect x="8" y="42" width="24" height="46" rx="8" fill="var(--n400)"/><rect class="anim" x="30" y="58" width="${plungerW}" height="14" rx="4" fill="var(--n400)"/>
<rect class="anim" x="${stopperX}" y="46" width="10" height="38" rx="3" fill="var(--n600)"/><rect class="anim" x="${fillX}" y="46" width="${fillW}" height="38" fill="var(--a300)"/>
<rect x="60" y="40" width="240" height="50" rx="10" fill="none" stroke="var(--n700)" stroke-width="3"/><rect x="300" y="58" width="16" height="14" rx="3" fill="var(--n600)"/><rect x="316" y="63" width="20" height="4" rx="2" fill="var(--n600)"/>
${ticks}<text x="20" y="144" fill="var(--n500)" font-size="11" font-weight="600">plunger end</text><text x="330" y="144" text-anchor="end" fill="var(--n500)" font-size="11" font-weight="600">needle end</text>${vial}${line}</svg>
<div class="cap">${m.st.syringe} syringe · ${cap} units</div></div>`;
  };
  const vialSVG = (m) => {
    const { cap, cur, nInj, water, injectedMl, st } = m;
    const vFillH = (cur.fill / cap) * 90, vFillY = 120 - vFillH, vStopY = vFillY - 8, vRodH = Math.max(0, vStopY - 12);
    const frac = nInj === 1 ? 1 : Math.min(1, water > 0 ? injectedMl / water : 0), vLiqH = 6 + frac * 58, vLiqY = 244 - vLiqH;
    const label = nInj === 1 ? `${fmt(water)} mL going into the vial` : (st.injected >= nInj ? `All ${fmt(water)} mL in the vial` : `${fmt(injectedMl)} of ${fmt(water)} mL in the vial`);
    return `<div class="diagram vial"><svg viewBox="0 0 340 250" font-family="Figtree, sans-serif">
<rect x="150" y="6" width="40" height="8" rx="4" fill="var(--n400)"/><rect class="anim" x="166" y="12" width="8" height="${vRodH}" rx="3" fill="var(--n400)"/>
<rect class="anim" x="153" y="${vStopY}" width="34" height="8" rx="3" fill="var(--n600)"/><rect class="anim" x="153" y="${vFillY}" width="34" height="${vFillH}" fill="var(--a300)"/>
<rect x="150" y="30" width="40" height="90" rx="8" fill="none" stroke="var(--n700)" stroke-width="3"/><rect x="163" y="120" width="14" height="10" rx="3" fill="var(--n600)"/><rect x="169" y="130" width="2.5" height="22" fill="var(--n600)"/>
<rect x="145" y="148" width="50" height="14" rx="4" fill="var(--n600)"/><rect x="155" y="160" width="30" height="16" fill="none" stroke="var(--n700)" stroke-width="3"/>
<rect class="anim" x="134" y="${vLiqY}" width="72" height="${vLiqH}" fill="var(--a300)"/><rect x="134" y="174" width="72" height="70" rx="10" fill="none" stroke="var(--n700)" stroke-width="3"/>
<path d="M170 176 C 172 190, 190 194, 200 206" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-dasharray="4 5"/>
<text x="216" y="192" fill="var(--n500)" font-size="11" font-weight="600">aim at the wall</text><text x="40" y="70" fill="var(--n500)" font-size="11" font-weight="600" text-anchor="middle">syringe</text><text x="40" y="215" fill="var(--n500)" font-size="11" font-weight="600" text-anchor="middle">vial</text></svg>
<div class="cap">${label}</div></div>`;
  };
  const barrelSVG = (cap) => { let t = ''; for (let i = 0; i <= 10; i++) { const x = 6 + i * 22, M = i % 2 === 0; t += `<line x1="${x}" y1="36" x2="${x}" y2="${M ? 45 : 41}" stroke="var(--n600)" stroke-width="${M ? 2 : 1.2}" stroke-linecap="round"/>`; if (M) t += `<text x="${x}" y="57" text-anchor="middle" fill="var(--n700)" font-size="10" font-weight="600">${cap / 10 * i}</text>`; } return `<svg viewBox="0 0 260 60" font-family="Figtree, sans-serif"><rect x="6" y="14" width="220" height="22" rx="6" fill="var(--n100)" stroke="var(--n700)" stroke-width="2.5"/><rect x="226" y="21" width="10" height="8" rx="2" fill="var(--n600)"/><rect x="236" y="23.5" width="14" height="3" rx="1.5" fill="var(--n600)"/>${t}</svg>`; };
  const ICON_X = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
  const ICON_CHECK = '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  const ICON_DL = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></svg>';

  // ---- views ----
  const numField = (field, value, unit, on) => `<label class="field${on ? ' on' : ''}"><input type="number" inputmode="decimal" placeholder="0" value="${esc(value)}" data-field="${field}" autofocus><span class="unit">${unit}</span></label>`;
  const unitSeg = (st) => `<div class="seg"><button class="${st.doseUnit === 'mg' ? 'on' : ''}" data-act="unit" data-arg="mg">mg <span>milligrams</span></button><button class="${st.doseUnit === 'mcg' ? 'on' : ''}" data-act="unit" data-arg="mcg">mcg <span>micrograms</span></button></div>`;
  const doseEcho = (m) => m.dose > 0 ? `<p class="echo">You entered ${fmt(m.dose, 3)} ${m.st.doseUnit} — that's ${m.st.doseUnit === 'mg' ? fmt(m.dose * 1000, 3) + ' mcg' : fmt(m.dose / 1000, 6) + ' mg'}.</p>` : '';
  const saveBox = (m) => m.st.saved ? `<p class="saved-pill">Saved as “${esc(m.st.savedName)}”. Find it on your home screen.</p>`
    : `<div class="row"><input class="text-input" type="text" placeholder="Compound name" value="${esc(m.st.guideName)}" data-field="guideName"><button class="btn btn-secondary" data-act="save" ${m.st.guideName.trim() ? '' : 'disabled'} style="min-height:52px;padding:0 20px;font-size:16px;font-weight:700">Save</button></div>`;

  function viewNotice() {
    return `<div class="overlay"><div class="brand">peptheory</div><div class="col" style="justify-content:center">
<h1>Before you start</h1>
<p class="body">peptheory.io does arithmetic on the numbers you enter. It doesn't check them, and it isn't medical advice.</p>
<p class="body">You're responsible for confirming every result before you use it. If you're unsure about anything, ask a licensed professional.</p>
<p class="body">By continuing you confirm you're an adult and legally permitted to possess what you're measuring.</p>
<p class="small">Everything you enter stays on this device. By continuing you agree to the <a href="#" data-act="legal" data-arg="terms" style="font-weight:600">Terms of use</a> and <a href="#" data-act="legal" data-arg="privacy" style="font-weight:600">Privacy policy</a>.</p>
</div><button class="btn btn-primary" data-act="accept">I understand</button></div>`;
  }
  function viewLegal() {
    const L = LEGAL[S.legal];
    return `<div class="overlay" style="z-index:3"><div class="bar"><div class="brand">peptheory</div><button class="btn btn-ghost" data-act="closeLegal">Close</button></div>
<div class="legal-body"><h1 style="font-size:30px">${L.title}</h1>${L.sections.map(([h, p]) => `<div style="display:flex;flex-direction:column;gap:4px"><b>${h}</b><p>${p}</p></div>`).join('')}</div></div>`;
  }
  function viewHeader(m) {
    const { st, step, inInputs, inResult, isSavedDraw, isHome, isSavedDose } = m;
    let right = '';
    if (inInputs) right = `<div style="display:flex;gap:6px">${[0, 1, 2, 3].map(i => `<div style="width:${i === step ? 28 : 8}px;height:8px;border-radius:999px;background:${i <= step ? 'var(--accent)' : 'var(--n300)'};transition:all .3s"></div>`).join('')}</div>`;
    else if (inResult || isSavedDraw || (!isSavedDose && step === 0 && !isHome && st.guides.length > 0)) right = `<button class="btn btn-ghost" data-act="restart">${st.guides.length ? 'Home' : 'Start over'}</button>`;
    return `<div class="bar"><div class="brand">peptheory</div>${right}</div>`;
  }
  function viewIntro() {
    const items = [['Syringe', 'The tool marked with lines called units that you use to measure and draw liquid. It comes in two sizes, U-50 and U-100.'], ['Compound vial', 'The small glass bottle containing your compound in powder form before it\u2019s mixed with water.'], ['Reconstitution solution', 'Sterile water with a preservative added, often labeled as bacteriostatic water on the bottle. It dissolves the powder into a liquid you can inject. Use only the solution your source specifies.']];
    return `<div class="col"><h1>What you'll need.</h1><div style="display:flex;flex-direction:column;gap:12px">${items.map(([b, p]) => `<div class="card"><b>${b}</b><p>${p}</p></div>`).join('')}</div><div class="grow"></div><button class="btn btn-primary" data-act="startFlow">Let's get started</button></div>`;
  }
  function viewHome(m) {
    const { st } = m;
    const undo = st.undo ? `<div class="undo"><span>Deleted “${esc(st.undo.g.name)}”</span><button class="btn btn-ghost" data-act="undo" style="font-weight:700">Undo</button></div>` : '';
    const list = st.guides.map((g, i) => `<div class="guide"><div class="top"><button class="open" data-act="open" data-arg="${i}"><span class="name">${esc(g.name)}</span><span class="sum">${fmt(g.mg)} mg in ${fmt(g.water)} mL · ${g.syringe}</span><span class="last">${g.dose ? `Same draw as last time: ${fmt(g.dose, 3)} ${g.doseUnit}` : 'Tap to set your draw'}</span></button><button class="btn btn-ghost btn-icon" data-act="remove" data-arg="${i}" aria-label="Delete guide" style="align-self:flex-start">${ICON_X}</button></div><button class="btn btn-ghost sage" data-act="remix" data-arg="${i}" style="align-self:flex-start;font-size:14px">Mix a new vial</button></div>`).join('');
    return `<div class="col"><h1>Your compounds</h1><p class="lead">${st.guides.length ? 'Tap one to work out your next draw.' : 'No saved compounds yet.'}</p>${undo}<div style="display:flex;flex-direction:column;gap:12px;margin-top:8px">${list}</div></div>
<div class="actions"><button class="btn btn-primary grow" data-act="startNew">Set up a new compound</button></div>
<div class="links"><a href="#" data-act="legal" data-arg="terms">Terms of use</a><a href="#" data-act="legal" data-arg="privacy">Privacy policy</a></div>`;
  }
  function viewInputs(m) {
    const { st, step, rec, valid } = m; let body = '';
    if (step === 0) body = `<div class="kicker">Step 1 of 4</div><h1>How much compound is in your vial?</h1><p class="lead">Not sure? Check the vial label and/or the certificate of analysis. Take your time. Small numbers matter here.</p>${numField('mg', st.mg, 'mg')}`;
    else if (step === 1) body = `<div class="kicker">Step 2 of 4</div><h1>What size syringe are you using?</h1><p class="lead">It's printed on the barrel or the packaging. A U-100 barrel is marked to 100; a U-50 is marked to 50 and each line is easier to read.</p>
<div style="display:flex;flex-direction:column;gap:12px;margin-top:8px">
<button class="choice${st.syringe === 'U-100' ? ' on' : ''}" data-act="syringe" data-arg="U-100"><span class="head"><b>U-100</b><span>100 units · 1 mL</span></span>${barrelSVG(100)}</button>
<button class="choice${st.syringe === 'U-50' ? ' on' : ''}" data-act="syringe" data-arg="U-50"><span class="head"><b>U-50</b><span>50 units · 0.5 mL</span></span>${barrelSVG(50)}</button></div>`;
    else if (step === 2) body = `<div class="kicker">Step 3 of 4</div><h1>How much do you want to draw?</h1><p class="lead">The amount of compound for one draw.</p>${numField('dose', st.dose, st.doseUnit)}${unitSeg(st)}${doseEcho(m)}`;
    else {
      const recMl = rec ? fmt(rec.ml) : '';
      if (!st.custom && rec) body = `<div class="kicker">Step 4 of 4</div><h1>Add ${recMl} mL of bacteriostatic water.</h1><p class="lead">${m.recReason}</p>
<div class="rec"><span class="l"><span class="big">${recMl} mL</span><span class="m">${m.recFills}</span></span><span class="r"><span class="u">${units(m.recU)} units</span><span class="m2">per draw</span></span></div>
<button class="btn btn-ghost" data-act="openCustom" style="align-self:flex-start;font-size:16px">Use a different amount</button>`;
      else body = `<div class="kicker">Step 4 of 4</div><h1>How much bacteriostatic water will you add?</h1><p class="lead">${rec ? `The recommended amount is ${recMl} mL. Double-check any other amount against your source: a wrong volume changes every dose. Measure carefully and fill to the line, not past it.` : 'Double-check this against your source: a wrong volume changes every dose. Measure carefully. Fill to the line, not past it.'}</p>${numField('water', st.water, 'mL', m.water > 0)}${rec ? `<button class="btn btn-ghost" data-act="useRec" style="align-self:flex-start;font-size:16px">Use the recommended ${recMl} mL</button>` : ''}`;
    }
    return `<div class="col">${body}</div><div class="actions">${step > 0 ? '<button class="btn btn-secondary" data-act="back">Back</button>' : ''}<button class="btn btn-primary grow" data-act="next" ${valid[step] ? '' : 'disabled'}>${step === 3 ? 'Show my steps' : 'Continue'}</button></div>`;
  }
  function viewSavedDose(m) {
    const { st } = m;
    return `<div class="col"><h1 class="sage" style="font-size:34px;line-height:1.1">${esc(st.guideName)}</h1><p class="sub">${fmt(m.mg)} mg in ${fmt(m.water)} mL · ${st.syringe} syringe</p><p style="margin-top:6px;font-size:24px;font-weight:600;line-height:1.3">How much do you want to draw?</p>${numField('dose', st.dose, st.doseUnit)}${unitSeg(st)}${doseEcho(m)}</div>
<div class="actions"><button class="btn btn-secondary" data-act="restart">Back</button><button class="btn btn-primary grow" data-act="savedNext" ${m.dose > 0 ? '' : 'disabled'}>Show my draw</button></div>`;
  }
  function viewSavedDraw(m) {
    const { st } = m, note = m.overNote || lineNote(m.drawUnits, false);
    return `<div class="col"><h1 class="sage" style="font-size:30px;line-height:1.1">${esc(st.guideName)}</h1><p class="sub">${fmt(m.mg)} mg in ${fmt(m.water)} mL · ${st.syringe} syringe</p>
<p class="step-text">Using a ${st.syringe} syringe, draw ${units(m.dFill)} units: turn the vial upside down and pull the plunger slowly to ${m.dl}. That's ${m.doseWord}.</p>
<p class="lead" style="font-size:16px">Then hold the syringe at eye level. If you see bubbles, tap the barrel so they rise, push them back into the vial, and re-draw to the line.</p>
${note ? `<p class="note">${note}</p>` : ''}${syringeSVG(m, true)}
<div style="display:flex;gap:4px;flex-wrap:wrap"><button class="btn btn-ghost" data-act="savedBack" style="font-size:16px">Change amount</button><button class="btn btn-ghost" data-act="goTable" style="font-size:16px">Units per draw table</button></div></div>
<p class="verify">Math only. Verify before use.</p>
<div class="row"><button class="btn btn-primary grow" data-act="restart">Done</button></div>`;
  }
  function viewResult(m) {
    const { st, r, LAST, isReady, isTable, cur, steps } = m;
    const kicker = isReady ? 'All done' : isTable ? 'Reference' : `Step ${Math.min(r, LAST) + 1} of 4`;
    let body = `<div class="bar"><div class="kicker">${kicker}</div>${!isTable && !isReady ? '<button class="btn btn-ghost sm" data-act="editNumbers">Edit numbers</button>' : ''}</div>`;
    if (!isTable && !isReady && r > 0) body += `<div class="done">${steps.slice(0, r).map(s => `<div><span>${s.n}</span><span>${s.short}</span></div>`).join('')}</div>`;
    if (isReady) body += `<div class="ready"><div class="check">${ICON_CHECK}</div><h1 style="font-size:34px;line-height:1.1">You're all set.</h1><p class="draw">${units(m.dFill)} units on your ${st.syringe} syringe = ${m.doseWord}.</p><p class="lead" style="font-size:16px">${fmt(m.mg)} mg in ${fmt(m.water)} mL. Every future ${m.doseWord} draw is ${m.dl}.</p><p class="well">Prepared carefully. Well done.</p></div>
<div style="display:flex;flex-direction:column;gap:10px;margin-top:8px"><div class="kicker sage">Save this compound</div>${saveBox(m)}</div>`;
    else if (isTable) body += `${st.saved && st.guideName.trim() ? `<div style="font-size:18px;font-weight:700;color:var(--s800)">${esc(st.guideName)}</div>` : ''}<h1 style="font-size:30px">Units per draw</h1><p class="lead" style="font-size:16px">${m.tableIntro}</p>
<div class="table">${m.tableRows.map(row => `<div class="tr${row.base ? ' base' : ''}"><span class="v">${row.units} <small>units</small></span><span class="eq">=</span><span class="v r">${row.amount} <small>${st.doseUnit}</small></span></div>`).join('')}</div>
${!st.saved ? `<div style="display:flex;flex-direction:column;gap:10px;margin-top:4px"><div class="kicker sage">Save this compound</div>${saveBox(m)}</div>` : ''}`;
    else {
      body += `<div class="cur"><span class="n">${cur.n}</span><p class="step-text">${cur.text}</p></div>${cur.how ? `<p class="how">${cur.how}</p>` : ''}`;
      if (m.showTracker) {
        const { nInj, wS, cap } = m, done = st.injected >= nInj;
        const dots = Array.from({ length: nInj }, (_, i) => `<span class="dot${i < st.injected ? ' on' : ''}" aria-label="Injection ${i + 1}">${i === nInj - 1 && wS.rem >= 0.05 ? units(wS.rem) : cap}</span>`).join('');
        const status = done ? `All ${fmt(m.water)} mL in` : `${fmt(m.injectedMl)} of ${fmt(m.water)} mL in`;
        const btnLabel = st.injected === 0 ? `I\u2019ve injected the first ${units(m.nextInjUnits)} units` : `I\u2019ve injected ${units(m.nextInjUnits)} more units`;
        body += `<div class="tracker"><div class="bar"><div class="dots">${dots}</div><span class="status">${status}</span></div>${!done ? `<button class="btn btn-secondary" data-act="trackerNext" style="width:100%;font-weight:700">${btnLabel}</button>` : ''}${st.injected > 0 ? '<button class="btn btn-ghost sm" data-act="trackerUndo" style="align-self:flex-start">Undo last</button>' : ''}</div>`;
      }
      if (r === 2) body += `<div class="diagram img"><img src="assets/mix-vial.png" alt="Hold the vial, roll it gently between your palms, and check that the liquid is clear"></div>`;
      else if (r === 1) body += vialSVG(m);
      else body += syringeSVG(m, r === LAST);
      if (cur.note) body += `<p class="note">${cur.note}</p>`;
    }
    let footer = '';
    if (r > 0 && !isReady) footer += '<button class="btn btn-secondary" data-act="rBack">Back</button>';
    if (r <= LAST) footer += '<button class="btn btn-primary grow" data-act="rNext">Next step</button>';
    else if (isReady) footer += '<button class="btn btn-secondary" data-act="restart">Done</button><button class="btn btn-primary grow" data-act="rNext">Units per draw table</button>';
    else footer += `<button class="btn btn-primary grow" data-act="download">${ICON_DL}Download</button>`;
    return `<div class="col${st.pushing ? ' pushing' : ''}">${body}</div><p class="verify">Math only. Verify before use.</p><div class="row">${footer}</div>`;
  }

  function render() {
    const m = model();
    const active = document.activeElement, field = active && active.dataset ? active.dataset.field : null;
    const selEnd = field && active.selectionEnd != null ? active.selectionEnd : null;
    let html = '';
    if (!S.noticeAccepted && !S.legal) html += viewNotice();
    if (S.legal) html += viewLegal();
    html += viewHeader(m);
    if (m.isIntro) html += viewIntro();
    else if (m.isHome) html += viewHome(m);
    else if (m.inInputs) html += viewInputs(m);
    else if (m.isSavedDose) html += viewSavedDose(m);
    else if (m.isSavedDraw) html += viewSavedDraw(m);
    else if (m.inResult) html += viewResult(m);
    app.innerHTML = html;
    const el = field ? app.querySelector(`[data-field="${field}"]`) : app.querySelector('[autofocus]');
    if (el) { el.focus({ preventScroll: true }); try { if (selEnd != null && el.type === 'text') el.setSelectionRange(selEnd, selEnd); } catch (e) {} }
  }

  function downloadTable(m) {
    const st = S, name = st.guideName.trim();
    const rows = m.tableRows.map(r => `<tr style="background:${r.base ? '#fff2eb' : 'transparent'}"><td style="padding:12px 20px;font-size:22px;font-weight:700;color:${r.base ? '#8c491a' : '#201e1d'};border-top:1px solid #eee7db">${r.units} <span style="font-size:14px;color:#82796a">units</span></td><td style="padding:12px 20px;text-align:center;color:#a19786;border-top:1px solid #eee7db">=</td><td style="padding:12px 20px;font-size:22px;font-weight:700;text-align:right;border-top:1px solid #eee7db">${r.amount} <span style="font-size:14px;color:#82796a">${st.doseUnit}</span></td></tr>`).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(name || 'peptheory.io')} — units per draw</title>
<link href="https://fonts.googleapis.com/css2?family=Caprasimo&family=Figtree:wght@400;600;700&display=swap" rel="stylesheet">
<style>body{margin:0;background:#f5ead8;font-family:Figtree,system-ui,sans-serif;color:#201e1d;display:flex;justify-content:center;padding:32px}@media print{body{background:#fff;padding:0}}</style></head>
<body><div style="width:400px;background:#f5ead8;border-radius:32px;padding:32px;box-sizing:border-box">
<div style="font-family:Caprasimo,serif;font-size:18px;margin-bottom:24px">peptheory</div>
${name ? `<div style="font-size:18px;font-weight:700;color:#3d472b;margin-bottom:6px">${esc(name)}</div>` : ''}
<h1 style="font-family:Caprasimo,serif;font-weight:400;font-size:30px;margin:0 0 10px">Units per draw</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#645c50">${esc(m.tableIntro)}</p>
<table style="width:100%;border-collapse:collapse;background:#f9f4ed;border-radius:24px;overflow:hidden">${rows}</table>
<p style="margin:24px 0 0;font-size:12px;color:#82796a">${st.syringe} syringe · ${fmt(m.mg)} mg in ${fmt(m.water)} mL</p>
<p style="margin:10px 0 0;font-size:12px;font-weight:600;color:#645c50">Math only. Verify before use. Not medical advice.</p>
</div><script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script></body></html>`;
    const w = window.open('', '_blank'); if (!w) return;
    w.document.open(); w.document.write(html); w.document.close();
  }

  // ---- actions ----
  const reset = () => ({ mg: '', water: '', dose: '', doseUnit: 'mg', custom: false, guideName: '', savedName: '', saved: false, injected: 0, pushing: false, rstep: 0 });
  const openGuide = (g, patch) => set({ mg: String(g.mg), water: String(g.water), dose: g.dose ? String(g.dose) : '', doseUnit: g.doseUnit || 'mg', syringe: g.syringe, rstep: 0, guideName: g.name, savedName: g.name, saved: true, injected: 0, home: false, intro: false, ...patch });
  const ACT = {
    accept() { try { localStorage.setItem(NOTICE_KEY, '1'); } catch (e) {} set({ noticeAccepted: true }); },
    legal(a) { set({ legal: a }); }, closeLegal() { set({ legal: null }); },
    startFlow() { set({ intro: false }); },
    startNew() { set({ intro: true, home: false, step: 0, ...reset() }); },
    restart() { set({ intro: true, step: 0, home: S.guides.length > 0, ...reset() }); },
    back() { set({ step: S.step - 1 }); },
    next() { const m = model(); if (!m.valid[S.step]) return; const p = { step: S.step + 1, rstep: 0, injected: 0 }; if (S.step === 2 && m.rec && !S.custom) p.water = String(m.rec.ml); set(p); },
    syringe(a) { set({ syringe: a }); }, unit(a) { set({ doseUnit: a }); },
    openCustom() { const m = model(); set({ custom: true, water: m.matchesOpt ? '' : S.water }); },
    useRec() { const m = model(); if (m.rec) set({ water: String(m.rec.ml), custom: false }); },
    editNumbers() { const m = model(); set({ step: 0, rstep: 0, home: false, injected: 0, pushing: false, custom: S.custom && !m.matchesOpt }); },
    rBack() { const m = model(); if (m.isTable && S.fromSaved) set({ step: 6 }); else set({ rstep: m.r - 1 }); },
    rNext() { const m = model(); const p = { rstep: m.r + 1 }; if (m.r === m.LAST && S.saved) { persist(S.guides.map(g => g.name === S.guideName ? { ...g, mg: m.mg, water: m.water, dose: m.dose, doseUnit: S.doseUnit, syringe: S.syringe } : g)); p.savedName = S.guideName; } set(p); },
    trackerNext() { const m = model(); if (S.injected >= m.nInj) return; clearTimeout(pushT); set({ injected: S.injected + 1, pushing: true }); pushT = setTimeout(() => set({ pushing: false }), 2200); },
    trackerUndo() { set({ injected: Math.max(0, S.injected - 1), pushing: false }); },
    save() { const m = model(), name = S.guideName.trim(); if (!name) return; persist([{ name, mg: m.mg, water: m.water, dose: m.dose, doseUnit: S.doseUnit, syringe: S.syringe }, ...S.guides.filter(x => x.name !== name)]); set({ saved: true, savedName: name }); },
    open(i) { const g = S.guides[+i]; openGuide(g, { step: g.dose > 0 ? 6 : 5 }); },
    remix(i) { openGuide(S.guides[+i], { step: 4, custom: true }); },
    remove(i) { i = +i; clearTimeout(undoT); const removed = S.guides[i]; persist(S.guides.filter((_, j) => j !== i)); set({ undo: { g: removed, at: i } }); undoT = setTimeout(() => set({ undo: null }), 6000); },
    undo() { if (!S.undo) return; clearTimeout(undoT); const g = S.guides.slice(); g.splice(Math.min(S.undo.at, g.length), 0, S.undo.g); persist(g); set({ undo: null }); },
    savedNext() { const m = model(); if (!(m.dose > 0)) return; persist(S.guides.map(g => g.name === S.guideName ? { ...g, dose: m.dose, doseUnit: S.doseUnit } : g)); set({ step: 6, fromSaved: false }); },
    savedBack() { set({ step: 5 }); },
    goTable() { set({ step: 4, rstep: 5, fromSaved: true }); },
    download() { downloadTable(model()); },
  };

  const app = document.getElementById('app');
  app.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]'); if (!t || t.disabled) return;
    if (t.tagName === 'A') e.preventDefault();
    const fn = ACT[t.dataset.act]; if (fn) fn(t.dataset.arg);
  });
  app.addEventListener('input', (e) => { const f = e.target.dataset.field; if (f) set({ [f]: e.target.value }); });
  app.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.dataset.field) { const b = app.querySelector('[data-act="next"],[data-act="savedNext"],[data-act="save"]'); if (b && !b.disabled) b.click(); } });
  render();
})();
