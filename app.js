/* 化学スキャン — 無料ドリル＆カード図鑑（プロトタイプ）
   データは data.js の window.CHEM_DATA から読む。進捗は localStorage に保存。 */
(function () {
  'use strict';
  var DATA = window.CHEM_DATA || { fields: [] };
  var LS_KEY = 'chem-scan-v1';
  var store = loadStore();

  function loadStore() {
    try {
      var s = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      s.answered = s.answered || {}; s.weak = s.weak || []; s.last = s.last || null;
      s.unlocked = s.unlocked || []; s.poolKeys = s.poolKeys || {}; s.review = s.review || {};
      return s;
    } catch (e) { return { answered: {}, weak: [], last: null, unlocked: [], poolKeys: {}, review: {} }; }
  }
  function saveStore() { try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch (e) {} }
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function allQuestions() {
    var out = [];
    DATA.fields.forEach(function (f) {
      (f.questions || []).forEach(function (q) { q._field = f.field; out.push(q); });
    });
    return out;
  }
  function allCards() {
    var out = [];
    DATA.fields.forEach(function (f) {
      (f.cards || []).forEach(function (c) { c._field = f.field; c._fieldLabel = f.fieldLabel; out.push(c); });
    });
    return out;
  }
  function findQ(id) {
    return allQuestions().find(function (q) { return q.id === id; }) ||
      PREMIUM_QS.find(function (q) { return q.id === id; });
  }
  function allQuestionsPlus() { return allQuestions().concat(PREMIUM_QS); }
  function findCard(id) { return allCards().find(function (c) { return c.id === id; }); }
  function fieldOf(name) { return DATA.fields.find(function (f) { return f.field === name; }); }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  /* ---------- 今日の10問（日付シードで決定的に選ぶ） ---------- */
  var NOTE_INDEX_URL = 'https://note.com/kagaku0808/n/nac78dab81a42';
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function todayLabel() {
    var d = new Date();
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }
  function seedHash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function dailyQuestions() {
    var rng = mulberry32(seedHash('chem-scan-daily-' + todayKey()));
    var pool = allQuestions().slice();
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1)); var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    return pool.slice(0, 10);
  }
  function rateForLecture(field, lectureId) {
    var qs = allQuestions().filter(function (q) { return q._field === field && q.lecture === lectureId; });
    var done = 0, ok = 0;
    qs.forEach(function (q) {
      var r = store.answered[q.id];
      if (r) { done++; if (r.ok) ok++; }
    });
    return { done: done, total: qs.length, rate: done ? ok / done : null };
  }
  function rateColor(rate) {
    if (rate == null) return '#8a97a3';
    if (rate >= 0.8) return '#1e7d46';
    if (rate >= 0.5) return '#b7791f';
    return '#c0392b';
  }

  /* ---------- ビュー切替 ---------- */
  var views = ['home', 'drill', 'result', 'card', 'map', 'premium'];
  function show(name) {
    views.forEach(function (v) { $('view-' + v).classList.toggle('hidden', v !== name); });
    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.view === name || (name === 'drill' && t.dataset.view === 'drill-total'));
    });
    window.scrollTo(0, 0);
  }

  /* ---------- ホーム ---------- */
  function renderHome() {
    $('daily-date').textContent = '（' + todayLabel() + '）';
    $('weak-count').textContent = store.weak.length;
    $('btn-resume').disabled = !store.last || !store.last.queue || !store.last.queue.length;
    $('btn-weak').disabled = !store.weak.length;
    var fl = $('field-list'); fl.innerHTML = '';
    DATA.fields.forEach(function (f) {
      var row = document.createElement('div'); row.className = 'field-row';
      var done = 0, total = (f.questions || []).length, ok = 0;
      (f.questions || []).forEach(function (q) { var r = store.answered[q.id]; if (r) { done++; if (r.ok) ok++; } });
      row.innerHTML = '<div><b>' + esc(f.fieldLabel) + '</b><div class="muted">' +
        (f.lectures || []).length + '講・' + total + '問・カード' + (f.cards || []).length + '枚' +
        (done ? '（挑戦済み ' + done + '問・正答率 ' + Math.round(100 * ok / done) + '%）' : '') +
        '</div></div>';
      var b = document.createElement('button'); b.className = 'btn'; b.textContent = 'ドリル';
      b.onclick = function () { startDrill({ mode: 'field', field: f.field, title: f.fieldLabel + 'ドリル' }); };
      row.appendChild(b); fl.appendChild(row);
    });
    renderCardList('');
    renderMap($('map-home'), false);
    renderPremiumSummary();
  }
  function renderCardList(q) {
    var list = $('card-list'); list.innerHTML = '';
    var cards = allCards().filter(function (c) {
      if (!q) return true;
      var hay = (c.name + ' ' + c.kind + ' ' + (c.points || []).map(function (p) { return p.text; }).join(' ')).toLowerCase();
      return hay.indexOf(q.toLowerCase()) !== -1;
    }).slice(0, 30);
    if (!cards.length) { list.innerHTML = '<p class="muted">見つかりませんでした。別の言葉で探してみてください。</p>'; return; }
    cards.forEach(function (c) {
      var b = document.createElement('button'); b.className = 'card-item';
      b.innerHTML = esc(c.name) + ' <span class="tag">' + esc(c._fieldLabel) + '・' + esc(c.kind) + '</span>';
      b.onclick = function () { openCard(c.id); };
      list.appendChild(b);
    });
  }
  function renderMap(el, full) {
    el.innerHTML = '';
    DATA.fields.forEach(function (f) {
      var h = document.createElement('h3'); h.textContent = f.fieldLabel; el.appendChild(h);
      if (f.field === 'organic') {
        var chain = document.createElement('div'); chain.className = 'map-chain';
        (f.lectures || []).forEach(function (lec, i) {
          var r = rateForLecture(f.field, lec.id);
          var n = document.createElement('button'); n.className = 'node';
          n.style.background = rateColor(r.rate);
          n.textContent = lec.title + (r.done ? ' ' + Math.round(100 * r.rate) + '%' : '');
          n.onclick = function () { startDrill({ mode: 'lecture', field: f.field, lecture: lec.id, title: f.fieldLabel + '・' + lec.title }); };
          chain.appendChild(n);
          if (i < f.lectures.length - 1) { var a = document.createElement('span'); a.className = 'arrow'; a.textContent = '→'; chain.appendChild(a); }
        });
        el.appendChild(chain);
      } else {
        var grid = document.createElement('div'); grid.className = 'heat';
        (f.lectures || []).forEach(function (lec) {
          var r = rateForLecture(f.field, lec.id);
          var c = document.createElement('button');
          c.className = 'heat-cell' + (r.rate == null ? ' untried' : '');
          c.style.background = rateColor(r.rate);
          c.innerHTML = esc(lec.title) + '<small>' + (r.done ? '正答率 ' + Math.round(100 * r.rate) + '%（' + r.done + '/' + r.total + '問）' : '未挑戦') + '</small>';
          c.onclick = function () { startDrill({ mode: 'lecture', field: f.field, lecture: lec.id, title: f.fieldLabel + '・' + lec.title }); };
          grid.appendChild(c);
        });
        el.appendChild(grid);
      }
    });
  }

  /* ---------- カード ---------- */
  /* 伏せ字: 文脈は表示したまま、重要語句（p.masks）だけを個別にマスクする。
     入れ子対策に長い語句から順に分割する。 */
  function renderPointText(p) {
    if (!p.blind || !p.masks || !p.masks.length) return esc(p.text);
    var segs = [{ t: p.text, m: false }];
    p.masks.slice().sort(function (a, b) { return b.length - a.length; }).forEach(function (mask) {
      var next = [];
      segs.forEach(function (s) {
        if (s.m) { next.push(s); return; }
        var parts = s.t.split(mask);
        parts.forEach(function (part, i) {
          if (i > 0) next.push({ t: mask, m: true });
          if (part) next.push({ t: part, m: false });
        });
      });
      segs = next;
    });
    return segs.map(function (s) {
      return s.m
        ? '<span class="blind" tabindex="0" role="button">' + esc(s.t) + '</span>'
        : esc(s.t);
    }).join('');
  }
  function openCard(id) {
    var c = findCard(id); if (!c) return;
    var d = $('card-detail');
    var html = '<div class="qmeta">' + esc(c._fieldLabel) + '・' + esc(c.kind) + '</div><h2>' + esc(c.name) + '</h2>';
    (c.points || []).forEach(function (p) {
      html += '<div class="point"><div class="plabel">' + esc(p.label) + '</div>' +
        (p.blind
          ? '<p class="ptext">' + renderPointText(p) + '</p><p class="muted">重要語句が伏せ字です。頭の中で思い描けてから、タップで1つずつ開示。</p>'
          : '<p class="ptext">' + esc(p.text) + '</p>') + '</div>';
    });
    html += '<p class="guide">この内容の「なぜ」と解き方は、まとめノート ' + esc(c.note || '') + ' で。</p>';
    html += '<button class="btn primary" id="btn-card-drill">この内容をドリル</button>';
    d.innerHTML = html;
    d.querySelectorAll('.blind').forEach(function (el) {
      var open = function () { el.classList.add('open'); };
      el.addEventListener('click', open);
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
    $('btn-card-drill').onclick = function () {
      startDrill({ mode: 'lecture', field: c._field, lecture: c.lecture, title: c._fieldLabel + '・' + c.name });
    };
    show('card');
  }

  /* ---------- ドリル ---------- */
  var session = null;
  function startDrill(opts) {
    var pool = allQuestions();
    if (opts.mode === 'field') pool = pool.filter(function (q) { return q._field === opts.field; });
    if (opts.mode === 'lecture') pool = pool.filter(function (q) { return q._field === opts.field && q.lecture === opts.lecture; });
    if (opts.mode === 'weak') pool = store.weak.map(findQ).filter(Boolean);
    if (opts.mode === 'premium') pool = PREMIUM_QS.filter(function (q) { return q._pool === opts.pool; });
    if (opts.mode === 'review') pool = reviewDueIds().map(findQ).filter(Boolean);
    if (opts.mode === 'exam') pool = allQuestionsPlus();
    if (opts.mode === 'total') {
      var fields = Array.prototype.slice.call(document.querySelectorAll('#total-filters input:checked')).map(function (i) { return i.dataset.field; });
      if (!fields.length) fields = ['theory', 'inorganic', 'organic'];
      pool = pool.filter(function (q) { return fields.indexOf(q._field) !== -1; });
    }
    if (!pool.length) { alert('この条件の問題がまだありません。'); return; }
    var queue;
    if (opts.mode === 'daily') {
      queue = dailyQuestions().map(function (q) { return q.id; });
    } else {
      var take = opts.mode === 'total' ? 10 : (opts.mode === 'exam' ? (opts.count || 20) : pool.length);
      queue = shuffle(pool).slice(0, take).map(function (q) { return q.id; });
    }
    session = { mode: opts.mode, title: opts.title || 'ドリル', queue: queue, idx: 0, results: [], wrong: [], retryRound: opts.mode === 'exam', teaserShown: false, timeUp: false };
    if (opts.mode === 'exam') { store.last = null; } else {
      store.last = { mode: opts.mode, field: opts.field, lecture: opts.lecture, title: session.title, queue: queue };
    }
    saveStore();
    show('drill');
    renderQuestion();
    if (opts.mode === 'exam') startExamTimer(opts.minutes || 20);
  }
  function currentQ() { return session ? findQ(session.queue[session.idx]) : null; }
  function renderQuestion() {
    var q = currentQ();
    $('q-feedback').classList.add('hidden'); $('q-actions').classList.add('hidden');
    $('q-choices').innerHTML = ''; $('q-numeric').classList.add('hidden');
    if (!q) { finishSession(); return; }
    $('drill-progress').textContent = session.title + '　' + (session.idx + 1) + ' / ' + session.queue.length;
    $('drill-score').textContent = '正解 ' + session.results.filter(function (r) { return r.ok; }).length + '問';
    $('progress-fill').style.width = Math.round(100 * session.idx / session.queue.length) + '%';
    var f = fieldOf(q._field);
    $('q-meta').textContent = (f ? f.fieldLabel : q._field) + '・' + (q.unit || '') + '　（' + (q.book || '') + '）';
    var pr = $('q-pdfref');
    var poolCfg = q._pool ? (PCONF.pools || {})[q._pool] : null;
    if (q._pool && q.page && poolCfg) {
      pr.innerHTML = 'この問題は <a href="' + esc(poolCfg.noteUrl) + '" target="_blank" rel="noopener">' +
        esc(poolCfg.noteName) + ' P.' + q.page + '</a> の問題です（タップでまとめノートへ）';
      pr.classList.remove('hidden');
    } else { pr.innerHTML = ''; pr.classList.add('hidden'); }
    $('q-text').textContent = q.q;
    if (q.type === 'numeric') {
      $('q-numeric').classList.remove('hidden');
      $('num-input').value = ''; $('num-unit').textContent = q.unit || '';
      $('num-input').focus();
    } else {
      var box = $('q-choices');
      q.choices.forEach(function (ch, i) {
        var b = document.createElement('button'); b.className = 'choice'; b.textContent = ch;
        b.onclick = function () { answerChoice(i); };
        box.appendChild(b);
      });
    }
  }
  function recordAnswer(q, ok) {
    var prev = store.answered[q.id] || { n: 0, ok: false };
    store.answered[q.id] = { n: prev.n + 1, ok: ok };
    if (ok) { store.weak = store.weak.filter(function (id) { return id !== q.id; }); }
    else if (store.weak.indexOf(q.id) === -1) { store.weak.push(q.id); }
    scheduleReview(q.id, ok);
    session.results.push({ id: q.id, ok: ok });
    if (!ok) session.wrong.push(q.id);
    saveStore();
  }
  function showFeedback(q, ok, extra) {
    var fb = $('q-feedback');
    fb.classList.remove('hidden');
    fb.className = 'feedback ' + (ok ? 'ok' : 'ng');
    var ans = q.type === 'numeric' ? (q.answer + (q.unit ? q.unit : '')) : q.choices[q.answer];
    fb.innerHTML = (ok ? '正解！' : 'ざんねん。正解は「' + esc(ans) + '」') +
      (extra ? '<br>' + esc(extra) : '') +
      '<br><span class="muted">ヒント：' + esc(q.hint || '') + '</span>';
    if (!ok && session && !session.teaserShown) {
      session.teaserShown = true;
      fb.innerHTML += '<div class="teaser">考え方のコツはまとめノートに整理してあります。<a href="' + NOTE_INDEX_URL + '" target="_blank" rel="noopener">まとめノートのご案内</a></div>';
    }
    $('q-actions').classList.remove('hidden');
    $('btn-q-card').onclick = function () {
      var cards = allCards().filter(function (c) { return c.lecture === q.lecture && c._field === q._field; });
      if (cards.length) openCard(cards[0].id); else { show('drill'); }
    };
    $('btn-q-next').onclick = nextQuestion;
  }
  function answerChoice(i) {
    var q = currentQ(); if (!q) return;
    var ok = i === q.answer;
    document.querySelectorAll('#q-choices .choice').forEach(function (b, j) {
      b.disabled = true;
      if (j === q.answer) b.classList.add('correct');
      else if (j === i) b.classList.add('wrong');
    });
    recordAnswer(q, ok);
    showFeedback(q, ok);
  }
  function answerNumeric() {
    var q = currentQ(); if (!q) return;
    var v = parseFloat($('num-input').value);
    if (isNaN(v)) { alert('数値を入力してください。'); return; }
    var tol = (q.tolerance == null ? 0.01 : q.tolerance);
    var ok = Math.abs(v - q.answer) <= tol;
    recordAnswer(q, ok);
    showFeedback(q, ok, 'あなたの答え：' + v + (q.unit ? q.unit : ''));
  }
  function nextQuestion() {
    session.idx++;
    if (session.idx >= session.queue.length) {
      if (session.wrong.length && !session.retryRound) {
        session.queue = shuffle(session.wrong); session.wrong = []; session.idx = 0; session.retryRound = true;
        session.title += '（再出題）';
        renderQuestion(); return;
      }
      finishSession(); return;
    }
    renderQuestion();
  }
  var lastResult = null;
  function lectureTitle(field, lectureId) {
    var f = fieldOf(field);
    if (!f) return lectureId;
    var lec = (f.lectures || []).find(function (l) { return l.id === lectureId; });
    return lec ? lec.title : lectureId;
  }
  function finishSession() {
    stopExamTimer();
    var total = session.results.length;
    var okN = session.results.filter(function (r) { return r.ok; }).length;
    var byField = {};
    session.results.forEach(function (r) {
      var q = findQ(r.id); if (!q) return;
      byField[q._field] = byField[q._field] || { ok: 0, n: 0 };
      byField[q._field].n++; if (r.ok) byField[q._field].ok++;
    });
    var wrongLectures = [];
    session.results.forEach(function (r) {
      if (r.ok) return;
      var q = findQ(r.id); if (!q) return;
      var label = (fieldOf(q._field) ? fieldOf(q._field).fieldLabel : q._field) + '・' + lectureTitle(q._field, q.lecture);
      if (wrongLectures.indexOf(label) === -1) wrongLectures.push(label);
    });
    lastResult = { title: session.title, okN: okN, total: total, byField: byField, wrongLectures: wrongLectures, date: todayLabel() };
    $('result-title').textContent = session.title + 'の結果';
    $('result-score').textContent = okN + ' / ' + total + '問正解（' + (total ? Math.round(100 * okN / total) : 0) + '%）';
    var weakFields = Object.keys(byField).filter(function (k) { return byField[k].ok / byField[k].n < 0.7; });
    $('result-msg').textContent = (session.timeUp ? '制限時間になりました。' : '') + (weakFields.length
      ? '穴が見つかりました。赤いところから埋めていきましょう。'
      : 'よくできました。この調子で総点検を回していきましょう。');
    var rf = $('result-fields'); rf.innerHTML = '';
    Object.keys(byField).forEach(function (k) {
      var f = fieldOf(k);
      var p = document.createElement('p');
      p.textContent = (f ? f.fieldLabel : k) + '：' + byField[k].ok + '/' + byField[k].n + '問';
      rf.appendChild(p);
    });
    var guide = '';
    if (weakFields.length) {
      guide = weakFields.map(function (k) {
        var f = fieldOf(k);
        return (f ? f.fieldLabel : k) + 'に穴があります。まとめノート' + (f ? f.fieldLabel : '') + '編で、間違えた講から埋めるのが近道です。';
      }).join(' ');
    } else if (total >= 10) {
      guide = '全分野で穴が見つかりませんでした。次は分野別ドリルで、まだ解いていない講に挑戦してみてください。';
    }
    $('result-guide').textContent = guide;
    var rt = $('result-teaser');
    if (wrongLectures.length) {
      rt.innerHTML = '考え方のコツはまとめノートに整理してあります。<a href="' + NOTE_INDEX_URL + '" target="_blank" rel="noopener">まとめノートのご案内</a>';
      rt.classList.remove('hidden');
    } else {
      rt.innerHTML = '';
      rt.classList.add('hidden');
    }
    $('btn-retry-wrong').disabled = !session.wrong.length && !session.results.some(function (r) { return !r.ok; });
    store.last = null; saveStore();
    drawResultCanvas(okN, total, byField);
    show('result');
    renderHome();
  }
  function drawResultCanvas(okN, total, byField) {
    var cv = $('result-canvas'); var ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 1080, 760);
    ctx.fillStyle = '#0f4c81'; ctx.fillRect(0, 0, 1080, 90);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 40px sans-serif';
    ctx.fillText('化学スキャン｜総点検の結果', 40, 58);
    ctx.fillStyle = '#1c2733'; ctx.font = 'bold 56px sans-serif';
    ctx.fillText(okN + ' / ' + total + '問正解', 40, 170);
    var y = 230;
    DATA.fields.forEach(function (f) {
      var r = rateForLectureAll(f.field);
      ctx.fillStyle = '#1c2733'; ctx.font = '28px sans-serif';
      ctx.fillText(f.fieldLabel + '（これまでの正答率 ' + (r.rate == null ? '未挑戦' : Math.round(100 * r.rate) + '%') + '）', 40, y);
      ctx.fillStyle = '#dbe3ea'; ctx.fillRect(40, y + 14, 1000, 26);
      ctx.fillStyle = rateColor(r.rate); ctx.fillRect(40, y + 14, r.rate == null ? 0 : 1000 * r.rate, 26);
      y += 90;
      (f.lectures || []).forEach(function (lec) {
        if (y > 700) return;
        var lr = rateForLecture(f.field, lec.id);
        ctx.fillStyle = rateColor(lr.rate);
        ctx.fillRect(40, y, 26, 26);
        ctx.fillStyle = '#1c2733'; ctx.font = '22px sans-serif';
        ctx.fillText(lec.title + (lr.done ? ' ' + Math.round(100 * lr.rate) + '%' : ' 未挑戦'), 78, y + 21);
        y += 36;
      });
      y += 10;
    });
    ctx.fillStyle = '#5b6b7a'; ctx.font = '22px sans-serif';
    ctx.fillText('緑＝穴なし　黄＝あと一歩　赤＝穴あり　グレー＝未挑戦', 40, 730);
  }
  function rateForLectureAll(field) {
    var qs = allQuestions().filter(function (q) { return q._field === field; });
    var done = 0, ok = 0;
    qs.forEach(function (q) { var r = store.answered[q.id]; if (r) { done++; if (r.ok) ok++; } });
    return { done: done, total: qs.length, rate: done ? ok / done : null };
  }

  /* ---------- 結果シェア画像（縦長・SNS向け） ---------- */
  function buildShareCanvas() {
    var W = 1080, H = 1350;
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    var r = lastResult || { title: 'ドリル', okN: 0, total: 0, byField: {}, wrongLectures: [], date: todayLabel() };
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#0f4c81'; ctx.fillRect(0, 0, W, 150);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 54px sans-serif';
    ctx.fillText('化学スキャン', 48, 78);
    ctx.font = '30px sans-serif';
    ctx.fillText(r.title + 'の結果', 48, 126);
    ctx.textAlign = 'right';
    ctx.font = '28px sans-serif';
    ctx.fillText(r.date, W - 48, 78);
    ctx.textAlign = 'left';
    var pct = r.total ? Math.round(100 * r.okN / r.total) : 0;
    ctx.fillStyle = '#1c2733'; ctx.font = 'bold 92px sans-serif';
    ctx.fillText(r.okN + ' / ' + r.total + '問正解', 48, 300);
    ctx.fillStyle = pct >= 80 ? '#1e7d46' : (pct >= 50 ? '#b7791f' : '#c0392b');
    ctx.font = 'bold 64px sans-serif';
    ctx.fillText('正答率 ' + pct + '%', 48, 384);
    var y = 470;
    ctx.fillStyle = '#1c2733'; ctx.font = 'bold 34px sans-serif';
    ctx.fillText('分野別の結果', 48, y); y += 26;
    DATA.fields.forEach(function (f) {
      var b = r.byField[f.field];
      ctx.fillStyle = '#1c2733'; ctx.font = '30px sans-serif';
      ctx.fillText(f.fieldLabel, 48, y + 38);
      ctx.fillStyle = '#dbe3ea'; ctx.fillRect(220, y + 12, 560, 30);
      if (b && b.n) {
        ctx.fillStyle = rateColor(b.ok / b.n); ctx.fillRect(220, y + 12, 560 * (b.ok / b.n), 30);
        ctx.fillStyle = '#1c2733'; ctx.font = '30px sans-serif';
        ctx.fillText(b.ok + ' / ' + b.n + '問', 806, y + 38);
      } else {
        ctx.fillStyle = '#5b6b7a'; ctx.font = '30px sans-serif';
        ctx.fillText('今回は未出題', 806, y + 38);
      }
      y += 74;
    });
    y += 18;
    ctx.fillStyle = '#1c2733'; ctx.font = 'bold 34px sans-serif';
    ctx.fillText('弱点サマリー（間違えた講）', 48, y); y += 50;
    ctx.font = '30px sans-serif';
    if (r.wrongLectures.length) {
      r.wrongLectures.slice(0, 6).forEach(function (label) {
        ctx.fillStyle = '#c0392b'; ctx.fillRect(48, y - 24, 20, 20);
        ctx.fillStyle = '#1c2733';
        ctx.fillText(label, 84, y);
        y += 46;
      });
      if (r.wrongLectures.length > 6) {
        ctx.fillStyle = '#5b6b7a'; ctx.font = '26px sans-serif';
        ctx.fillText('ほか ' + (r.wrongLectures.length - 6) + ' 講', 84, y); y += 40;
      }
    } else {
      ctx.fillStyle = '#1e7d46';
      ctx.fillText('弱点なし。全問正解でした！', 48, y); y += 46;
    }
    ctx.fillStyle = '#5b6b7a'; ctx.font = '26px sans-serif';
    ctx.fillText('「なぜ」と解き方は、まとめノート（受験化学まとめノート）で。', 48, H - 96);
    ctx.fillStyle = '#0f4c81'; ctx.font = 'bold 30px sans-serif';
    ctx.fillText('化学スキャン｜登録不要・完全無料', 48, H - 48);
    return cv;
  }
  function downloadCanvas(cv, name) {
    var a = document.createElement('a');
    a.download = name;
    a.href = cv.toDataURL('image/png');
    a.click();
  }
  function shareResultImage() {
    if (!lastResult) return;
    var cv = buildShareCanvas();
    function fallback() { downloadCanvas(cv, 'chem-scan-share.png'); }
    if (cv.toBlob && window.File) {
      cv.toBlob(function (blob) {
        if (!blob) { fallback(); return; }
        var file = new File([blob], 'chem-scan-share.png', { type: 'image/png' });
        if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: '化学スキャンの結果' }).catch(function () { /* キャンセル時は何もしない */ });
        } else { fallback(); }
      }, 'image/png');
    } else { fallback(); }
  }

  /* ---------- 購入者特典（解放システム） ---------- */
  /* コードの平文はアプリ内に持たない。照合はハッシュ、特典データはコード由来キーで
     ラップしたプールキーでのみ復号できる。完全な保護ではない前提（README参照）。 */
  function sha256Bytes(input) {
    var K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
    var bytes = (typeof input === 'string') ? new TextEncoder().encode(input) : input;
    var l = bytes.length, bitLen = l * 8;
    var padded = new Uint8Array((((l + 8) >> 6) + 1) << 6);
    padded.set(bytes); padded[l] = 0x80;
    var dv = new DataView(padded.buffer);
    dv.setUint32(padded.length - 4, bitLen >>> 0);
    dv.setUint32(padded.length - 8, Math.floor(bitLen / 4294967296));
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var w = new Uint32Array(64);
    for (var off = 0; off < padded.length; off += 64) {
      var t;
      for (t = 0; t < 16; t++) w[t] = dv.getUint32(off + t * 4);
      for (t = 16; t < 64; t++) {
        var s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        var s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (t = 0; t < 64; t++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var temp1 = (h + S1 + ch + K[t] + w[t]) | 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var temp2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + temp1) | 0;
        d = c; c = b; b = a; a = (temp1 + temp2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    var out = new Uint8Array(32);
    var odv = new DataView(out.buffer);
    H.forEach(function (x, i) { odv.setUint32(i * 4, x >>> 0); });
    return out;
  }
  function sha256hex(str) {
    return Array.prototype.map.call(sha256Bytes(str), function (b) {
      return ('0' + b.toString(16)).slice(-2);
    }).join('');
  }
  function hexToBytes(hex) {
    var out = new Uint8Array(hex.length / 2);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  }
  function bytesToHex(bs) {
    return Array.prototype.map.call(bs, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function b64ToBytes(b64) {
    var bin = atob(b64), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function keystream(keyBytes, len) {
    var out = new Uint8Array(len), pos = 0, counter = 0;
    while (pos < len) {
      var block = new Uint8Array(keyBytes.length + 4);
      block.set(keyBytes);
      new DataView(block.buffer).setUint32(keyBytes.length, counter);
      var h = sha256Bytes(block);
      out.set(h.subarray(0, Math.min(32, len - pos)), pos);
      pos += 32; counter++;
    }
    return out;
  }
  function xorBytes(a, b) {
    var out = new Uint8Array(a.length);
    for (var i = 0; i < a.length; i++) out[i] = a[i] ^ b[i];
    return out;
  }

  var PCONF = window.CHEM_PREMIUM_CONFIG || { products: [], pools: {} };
  var PREMIUM_QS = [];
  var loadedPools = {};
  function featuresUnlocked() { return (store.unlocked || []).length > 0; }
  function poolUnlocked(poolId) { return !!(store.poolKeys || {})[poolId]; }
  function normalizeCode(s) {
    return String(s || '').replace(/[-\s　]/g, '').toUpperCase();
  }
  function loadPool(poolId, cb) {
    cb = cb || function () {};
    if (loadedPools[poolId]) { cb(true); return; }
    var pool = (PCONF.pools || {})[poolId];
    var keyHex = (store.poolKeys || {})[poolId];
    if (!pool || !keyHex) { cb(false); return; }
    var script = document.createElement('script');
    script.src = pool.file;
    script.onload = function () {
      try {
        var payload = window.CHEM_PREMIUM_PAYLOAD;
        if (!payload || payload.pool !== poolId) { cb(false); return; }
        var cipher = b64ToBytes(payload.data);
        var plain = xorBytes(cipher, keystream(hexToBytes(keyHex), cipher.length));
        var text = new TextDecoder().decode(plain);
        if (sha256hex(text) !== pool.checksum) { cb(false); return; }
        var data = JSON.parse(text);
        (data.questions || []).forEach(function (q) {
          q._field = data.field || 'theory'; q._pool = poolId;
          PREMIUM_QS.push(q);
        });
        loadedPools[poolId] = true;
        cb(true);
      } catch (e) { cb(false); }
    };
    script.onerror = function () { cb(false); };
    document.head.appendChild(script);
  }
  function tryUnlock(rawCode) {
    var norm = normalizeCode(rawCode);
    if (!norm) return { ok: false, msg: 'コードを入力してください。' };
    var hash = sha256hex('chem-scan-verify-v1:' + norm);
    var product = (PCONF.products || []).find(function (p) { return p.hash === hash; });
    if (!product) {
      return { ok: false, msg: 'コードが正しくありません。入力ミスがないか、購入した商品の有料エリアに載っているコードかどうかを確認してください。' };
    }
    if (store.unlocked.indexOf(product.id) !== -1) {
      return { ok: true, msg: '「' + product.name + '」はすでに解放されています。' };
    }
    store.unlocked.push(product.id);
    var codeKey = sha256Bytes('chem-scan-enckey-v1:' + norm);
    var newPools = [];
    Object.keys(PCONF.pools || {}).forEach(function (poolId) {
      var wrapped = (PCONF.pools[poolId].wrapped || {})[product.id];
      if (wrapped) {
        var poolKey = xorBytes(b64ToBytes(wrapped), keystream(codeKey, 32));
        store.poolKeys[poolId] = bytesToHex(poolKey);
        newPools.push(poolId);
      }
    });
    saveStore();
    newPools.forEach(function (poolId) { loadPool(poolId, function () { renderHome(); }); });
    return { ok: true, msg: '「' + product.name + '」の特典を解放しました。' };
  }

  /* ---------- 復習管理（忘却曲線） ---------- */
  var REVIEW_INTERVALS = [1, 3, 7, 14, 30];
  function addDaysKey(key, days) {
    var p = key.split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2] + days);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function scheduleReview(qid, ok) {
    var e = store.review[qid];
    if (!ok) {
      store.review[qid] = { stage: 0, due: addDaysKey(todayKey(), REVIEW_INTERVALS[0]) };
      return;
    }
    if (e && session && session.mode === 'review') {
      e.stage++;
      if (e.stage >= REVIEW_INTERVALS.length) { delete store.review[qid]; }
      else { e.due = addDaysKey(todayKey(), REVIEW_INTERVALS[e.stage]); }
    }
  }
  function reviewDueIds() {
    var t = todayKey();
    return Object.keys(store.review).filter(function (id) {
      return store.review[id].due <= t && findQ(id);
    });
  }

  /* ---------- 模試モード（タイマー） ---------- */
  var examTimer = null;
  function stopExamTimer() {
    if (examTimer) { clearInterval(examTimer); examTimer = null; }
    var el = $('drill-timer');
    if (el) { el.textContent = ''; el.classList.remove('timer-warn'); }
  }
  function startExamTimer(minutes) {
    stopExamTimer();
    var remain = minutes * 60;
    var el = $('drill-timer');
    function tick() {
      var m = Math.floor(remain / 60), s = remain % 60;
      el.textContent = '残り ' + m + '分' + (s < 10 ? '0' : '') + s + '秒';
      el.classList.toggle('timer-warn', remain <= 60);
      if (remain <= 0) {
        stopExamTimer();
        if (session && session.mode === 'exam') {
          session.timeUp = true;
          finishSession();
        }
        return;
      }
      remain--;
    }
    tick();
    examTimer = setInterval(tick, 1000);
  }

  /* ---------- 特典画面 ---------- */
  function renderPremium() {
    var unlocked = featuresUnlocked();
    $('premium-feature-state').innerHTML = unlocked
      ? '機能（復習管理・模試モード・PDF連携）は <b>解放済み</b> です。'
      : '機能（復習管理・模試モード・PDF連携）は <b>未解放</b> です。どれか1冊のコードを入力すると解放されます。';
    $('premium-tools').classList.toggle('hidden', !unlocked);
    if (unlocked) {
      var due = reviewDueIds().length;
      $('review-due-count').textContent = due;
      $('btn-review-start').disabled = !due;
      var tp = $('btn-pool-theory');
      if (poolUnlocked('theory')) {
        tp.disabled = false;
        tp.textContent = '特典問題ドリル（理論編・' + PREMIUM_QS.filter(function (q) { return q._pool === 'theory'; }).length + '問）';
      } else {
        tp.disabled = true;
        tp.textContent = '特典問題ドリル（理論編）は未解放です';
      }
      var ip = $('btn-pool-inorganic');
      if (poolUnlocked('inorganic')) {
        ip.disabled = false;
        ip.textContent = '特典問題ドリル（無機編・' + PREMIUM_QS.filter(function (q) { return q._pool === 'inorganic'; }).length + '問）';
      } else {
        ip.disabled = true;
        ip.textContent = '特典問題ドリル（無機編）は未解放です';
      }
      var op = $('btn-pool-organic');
      if (poolUnlocked('organic')) {
        op.disabled = false;
        op.textContent = '特典問題ドリル（有機編 本編・' + PREMIUM_QS.filter(function (q) { return q._pool === 'organic'; }).length + '問）';
      } else {
        op.disabled = true;
        op.textContent = '特典問題ドリル（有機編 本編）は未解放です';
      }
    }
    var list = $('premium-products'); list.innerHTML = '';
    (PCONF.products || []).forEach(function (p) {
      var row = document.createElement('div'); row.className = 'premium-row';
      var isU = store.unlocked.indexOf(p.id) !== -1;
      row.innerHTML = '<div><b>' + esc(p.name) + '</b> ' +
        (isU ? '<span class="badge badge-ok">解放済み</span>' : '<span class="badge badge-lock">未解放</span>') +
        '<div class="muted">' + esc(p.desc) + '</div></div>';
      list.appendChild(row);
    });
  }
  function renderPremiumSummary() {
    var el = $('premium-summary');
    if (!el) return;
    if (featuresUnlocked()) {
      var names = (PCONF.products || []).filter(function (p) { return store.unlocked.indexOf(p.id) !== -1; })
        .map(function (p) { return p.name; });
      el.textContent = '特典は解放済みです（' + names.join('、') + '）。復習管理・模試モード・PDF連携と、解放済みの問題プールが使えます。';
    } else {
      el.textContent = 'まとめノート購入者向けの特典があります。購入した商品に載っている解除コードを入力すると、復習管理・模試モード・PDF連携と、その本の問題プール（順次追加中）が解放されます。このアプリの今の機能は、コードなしで全部無料で使えます。';
    }
  }

  /* ---------- 配線 ---------- */
  $('btn-total').onclick = function () { startDrill({ mode: 'total', title: '総点検' }); };
  $('btn-daily').onclick = function () { startDrill({ mode: 'daily', title: '今日の10問' }); };
  $('btn-share-img').onclick = shareResultImage;
  $('btn-resume').onclick = function () {
    if (!store.last) return;
    var l = store.last;
    session = { mode: l.mode, title: l.title, queue: l.queue, idx: 0, results: [], wrong: [], retryRound: false };
    show('drill'); renderQuestion();
  };
  $('btn-weak').onclick = function () { startDrill({ mode: 'weak', title: '苦手リスト' }); };
  $('btn-weak-clear').onclick = function () {
    if (confirm('苦手リストを空にしますか？（挑戦記録は残ります）')) { store.weak = []; saveStore(); renderHome(); }
  };
  $('btn-map').onclick = function () { renderMap($('map-full'), true); show('map'); };
  $('btn-map-back').onclick = function () { show('home'); };
  $('btn-card-back').onclick = function () { show('home'); };
  $('btn-home2').onclick = function () { show('home'); };
  $('btn-drill-quit').onclick = function () { stopExamTimer(); show('home'); renderHome(); };
  $('btn-premium-open').onclick = function () { renderPremium(); show('premium'); };
  $('btn-premium-back').onclick = function () { show('home'); renderHome(); };
  $('btn-unlock').onclick = function () {
    var r = tryUnlock($('unlock-code').value);
    var m = $('unlock-msg');
    m.textContent = r.msg;
    m.className = r.ok ? 'unlock-msg ok' : 'unlock-msg ng';
    if (r.ok) { $('unlock-code').value = ''; renderPremium(); }
  };
  $('unlock-code').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('btn-unlock').click(); });
  $('btn-review-start').onclick = function () { startDrill({ mode: 'review', title: '復習（忘却曲線）' }); };
  $('btn-exam-start').onclick = function () {
    var count = parseInt($('exam-count').value, 10) || 20;
    var minutes = parseInt($('exam-minutes').value, 10) || 20;
    startDrill({ mode: 'exam', title: '模試', count: count, minutes: minutes });
  };
  $('btn-pool-theory').onclick = function () { startDrill({ mode: 'premium', pool: 'theory', title: '特典問題ドリル（理論編）' }); };
  $('btn-pool-inorganic').onclick = function () { startDrill({ mode: 'premium', pool: 'inorganic', title: '特典問題ドリル（無機編）' }); };
  $('btn-pool-organic').onclick = function () { startDrill({ mode: 'premium', pool: 'organic', title: '特典問題ドリル（有機編 本編）' }); };
  $('btn-q-next').onclick = nextQuestion;
  $('btn-num-check').onclick = answerNumeric;
  $('num-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') answerNumeric(); });
  $('search').addEventListener('input', function (e) { renderCardList(e.target.value.trim()); });
  $('btn-save-img').onclick = function () {
    var a = document.createElement('a');
    a.download = 'chem-scan-result.png';
    a.href = $('result-canvas').toDataURL('image/png');
    a.click();
  };
  $('btn-retry-wrong').onclick = function () {
    var wrong = session.results.filter(function (r) { return !r.ok; }).map(function (r) { return r.id; });
    if (!wrong.length) return;
    session = { mode: 'weak', title: '間違えた問題の再出題', queue: shuffle(wrong), idx: 0, results: [], wrong: [], retryRound: true };
    show('drill'); renderQuestion();
  };
  document.querySelectorAll('.tab').forEach(function (t) {
    t.onclick = function () {
      var v = t.dataset.view;
      if (v === 'drill-total') { startDrill({ mode: 'total', title: '総点検' }); return; }
      if (v === 'cards') { show('home'); setTimeout(function () { $('search').focus(); }, 50); return; }
      if (v === 'map') { renderMap($('map-full'), true); show('map'); return; }
      show('home');
    };
  });
  /* 解放済みプールがあれば読み込む（コード入力前は読み込まない） */
  Object.keys(store.poolKeys || {}).forEach(function (poolId) {
    loadPool(poolId, function () { renderHome(); });
  });
  renderHome();
})();
