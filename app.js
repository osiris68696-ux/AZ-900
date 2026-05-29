const questions = window.AZ900_QUESTIONS || [];
const storeKey = "az900-practice-state-v1";
const examAccessCode = "01156688@";

const state = {
  pool: [],
  index: 0,
  answers: {},
  submitted: {},
  flagged: {},
  instantReview: true,
  reviewMode: false,
  durationSeconds: 3600,
  remainingSeconds: 3600,
  timerId: null
};

const els = {
  setup: document.querySelector("#setup-panel"),
  exam: document.querySelector("#exam-panel"),
  results: document.querySelector("#results-panel"),
  form: document.querySelector("#setup-form"),
  mode: document.querySelector("#mode"),
  count: document.querySelector("#question-count"),
  duration: document.querySelector("#exam-duration"),
  instant: document.querySelector("#instant-review"),
  card: document.querySelector("#question-card"),
  nav: document.querySelector("#nav-grid"),
  progressLabel: document.querySelector("#progress-label"),
  scoreLabel: document.querySelector("#score-label"),
  timerLabel: document.querySelector("#timer-label"),
  floatingTimer: document.querySelector("#floating-timer"),
  progressFill: document.querySelector("#progress-fill"),
  prev: document.querySelector("#prev-question"),
  next: document.querySelector("#next-question"),
  submit: document.querySelector("#submit-answer"),
  showAnswer: document.querySelector("#show-answer"),
  mark: document.querySelector("#mark-question"),
  finish: document.querySelector("#finish-exam"),
  resultTitle: document.querySelector("#result-title"),
  resultNote: document.querySelector("#result-note"),
  scoreNumber: document.querySelector("#score-number"),
  wrongList: document.querySelector("#wrong-list"),
  reviewWrong: document.querySelector("#review-wrong"),
  restart: document.querySelector("#restart")
};

const accessEls = {
  modal: document.querySelector("#access-modal"),
  input: document.querySelector("#exam-access-code"),
  dots: [...document.querySelectorAll(".pin-dots span")],
  error: document.querySelector("#access-error"),
  unlock: document.querySelector("#unlock-exam"),
  cancel: document.querySelector("#cancel-access"),
  close: document.querySelector("#close-access")
};

let pendingStart = null;

function saved() {
  try {
    return JSON.parse(localStorage.getItem(storeKey)) || { wrong: [], flagged: [] };
  } catch {
    return { wrong: [], flagged: [] };
  }
}

function persistWrong() {
  const current = saved();
  const wrong = new Set(current.wrong || []);
  for (const q of state.pool) {
    if (!state.submitted[q.id]) continue;
    if (isCorrect(q)) wrong.delete(q.id);
    else wrong.add(q.id);
  }
  localStorage.setItem(storeKey, JSON.stringify({
    wrong: [...wrong].sort((a, b) => a - b),
    flagged: Object.keys(state.flagged).map(Number).sort((a, b) => a - b)
  }));
  updateHeader();
}

function updateHeader() {
  const wrong = saved().wrong || [];
  const auto = questions.filter(q => q.answer.length).length;
  document.querySelector("#total-count").textContent = `${questions.length} 題`;
  document.querySelector("#auto-count").textContent = `${auto} 題可自動判分`;
  document.querySelector("#saved-count").textContent = `錯題 ${wrong.length}`;
  document.querySelector("#metric-total").textContent = questions.length;
  document.querySelector("#metric-auto").textContent = auto;
}

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function startExam(mode, limit, reviewMode = false, durationMinutes = 60) {
  const wrongSet = new Set(saved().wrong || []);
  let pool = questions;
  if (mode === "wrong") pool = questions.filter(q => wrongSet.has(q.id));
  if (mode === "random") pool = shuffle(pool);
  pool = pool.slice(0, Math.max(1, Math.min(limit, pool.length || questions.length)));
  if (!pool.length) pool = questions.slice(0, Math.min(limit, questions.length));

  Object.assign(state, {
    pool,
    index: 0,
    answers: {},
    submitted: {},
    flagged: {},
    instantReview: els.instant.checked,
    reviewMode,
    durationSeconds: durationMinutes * 60,
    remainingSeconds: durationMinutes * 60
  });

  els.setup.classList.add("hidden");
  els.results.classList.add("hidden");
  els.exam.classList.remove("hidden");
  els.floatingTimer.classList.remove("hidden");
  startTimer();
  renderNav();
  renderQuestion();
}

function stopTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

function startTimer() {
  stopTimer();
  updateTimerDisplay();
  state.timerId = setInterval(() => {
    state.remainingSeconds = Math.max(0, state.remainingSeconds - 1);
    updateTimerDisplay();
    if (state.remainingSeconds === 0) {
      stopTimer();
      finishExam();
    }
  }, 1000);
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function updateTimerDisplay() {
  const value = formatTime(state.remainingSeconds);
  els.timerLabel.textContent = `剩餘 ${value}`;
  els.floatingTimer.textContent = value;
  const warning = state.remainingSeconds <= 300;
  els.timerLabel.classList.toggle("warning", warning);
  els.floatingTimer.classList.toggle("warning", warning);
}

function openAccessModal(callback) {
  pendingStart = callback;
  accessEls.input.value = "";
  accessEls.error.textContent = "";
  updatePinDots();
  accessEls.modal.classList.remove("hidden");
  setTimeout(() => accessEls.input.focus(), 0);
}

function closeAccessModal() {
  accessEls.modal.classList.add("hidden");
  pendingStart = null;
}

function updatePinDots() {
  const length = accessEls.input.value.length;
  accessEls.dots.forEach((dot, index) => dot.classList.toggle("filled", index < length));
}

function unlockExam() {
  if (accessEls.input.value !== examAccessCode) {
    accessEls.error.textContent = "通行碼錯誤，請重新輸入。";
    accessEls.input.value = "";
    updatePinDots();
    accessEls.input.focus();
    return;
  }
  const callback = pendingStart;
  closeAccessModal();
  if (callback) callback();
}

function currentQuestion() {
  return state.pool[state.index];
}

function selectedValues(q) {
  return state.answers[q.id] || [];
}

function sameSet(a, b) {
  return a.length === b.length && a.every(x => b.includes(x));
}

function isCorrect(q) {
  if (!q.answer.length) return false;
  return sameSet([...selectedValues(q)].sort(), [...q.answer].sort());
}

function answerLabel(q) {
  if (q.answer.length) {
    return q.answer.map(key => {
      const option = q.options.find(item => item.key === key);
      if (!option) return key;
      return `${key}. ${optionText(option)}`;
    }).join("\n");
  }
  return "請自我核對";
}

function optionText(option) {
  const zh = option.textZh || option.text;
  if (!option.text || zh.trim() === option.text.trim()) return zh;
  return `${zh}（${option.text}）`;
}

function answerText(q) {
  const zh = q.answerTextZh || q.answerText || "";
  if (!q.answerText || zh.trim() === q.answerText.trim()) return zh;
  return `${zh}\n\n英文原文：\n${q.answerText}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function linkify(url) {
  const safe = escapeHtml(url);
  return `<a href="${safe}" target="_blank" rel="noreferrer">${safe}</a>`;
}

function renderQuestion() {
  const q = currentQuestion();
  const selected = new Set(selectedValues(q));
  const submitted = Boolean(state.submitted[q.id]);
  const canAuto = q.answer.length > 0;
  const inputType = q.type === "multiple" ? "checkbox" : "radio";

  const options = q.options.length
    ? `<div class="options">${q.options.map(opt => {
        const isSelected = selected.has(opt.key);
        const isAnswer = submitted && q.answer.includes(opt.key);
        const isWrong = submitted && isSelected && !q.answer.includes(opt.key);
        return `
          <label class="option ${isSelected ? "selected" : ""} ${isAnswer ? "correct-answer" : ""} ${isWrong ? "wrong-answer" : ""}">
            <input type="${inputType}" name="answer" value="${opt.key}" ${isSelected ? "checked" : ""} ${submitted ? "disabled" : ""}>
            <span><strong>${opt.key}.</strong> ${escapeHtml(optionText(opt))}</span>
          </label>`;
      }).join("")}</div>`
    : `<div class="self-check">此題在 PDF 中屬於 ${escapeHtml(q.type)} 題型，原始答案可能是圖片、下拉或熱區。請先在心中作答，再按「顯示解析」核對。</div>`;

  els.card.className = `question-card ${submitted ? (isCorrect(q) ? "correct" : "wrong") : ""}`;
  els.card.innerHTML = `
    <div class="question-meta">Topic ${q.topic} · Question #${q.id} · ${escapeHtml(q.type)}</div>
    <div class="question-title">第 ${state.index + 1} 題 / 題庫 #${q.id}</div>
    <div class="question-text">${escapeHtml(q.questionZh || q.question)}</div>
    ${(q.questionZh && q.questionZh !== q.question) ? `<div class="original-text"><strong>英文原文：</strong>\n${escapeHtml(q.question)}</div>` : ""}
    ${options}
    <div class="answer-panel ${submitted && state.instantReview ? "show" : ""}" id="answer-panel">
      <div class="answer-line">答案：${escapeHtml(answerLabel(q))}${canAuto ? "" : "\n" + escapeHtml(answerText(q))}</div>
      ${canAuto ? `<div class="comment-box"><strong>解析：</strong>\n${escapeHtml(answerText(q))}</div>` : ""}
      ${q.comments ? `<div class="comment-box"><strong>社群評論摘錄：</strong>\n${escapeHtml(q.comments)}</div>` : ""}
      ${q.references.length ? `<div class="refs"><strong>參考連結：</strong><br>${q.references.map(linkify).join("<br>")}</div>` : ""}
    </div>`;

  els.card.querySelectorAll("input[name='answer']").forEach(input => {
    input.addEventListener("change", () => {
      if (q.type === "multiple") {
        state.answers[q.id] = [...els.card.querySelectorAll("input[name='answer']:checked")].map(item => item.value);
      } else {
        state.answers[q.id] = [input.value];
      }
      renderQuestion();
    });
  });

  els.progressLabel.textContent = `第 ${state.index + 1} / ${state.pool.length} 題`;
  els.scoreLabel.textContent = `答對 ${correctCount()}`;
  els.progressFill.style.width = `${((state.index + 1) / state.pool.length) * 100}%`;
  els.prev.disabled = state.index === 0;
  els.next.disabled = state.index === state.pool.length - 1;
  els.submit.disabled = submitted || (!selected.size && q.options.length > 0);
  els.mark.textContent = state.flagged[q.id] ? "取消標記" : "標記複查";
  renderNav();
}

function renderNav() {
  els.nav.innerHTML = state.pool.map((q, i) => {
    const classes = [
      i === state.index ? "active" : "",
      state.submitted[q.id] ? "answered" : "",
      state.submitted[q.id] && !isCorrect(q) ? "wrong" : "",
      state.flagged[q.id] ? "flagged" : ""
    ].filter(Boolean).join(" ");
    return `<button type="button" class="${classes}" data-index="${i}">${i + 1}</button>`;
  }).join("");
  els.nav.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      state.index = Number(btn.dataset.index);
      renderQuestion();
    });
  });
}

function correctCount() {
  return state.pool.filter(q => state.submitted[q.id] && isCorrect(q)).length;
}

function finishExam() {
  stopTimer();
  els.floatingTimer.classList.add("hidden");
  persistWrong();
  const submitted = state.pool.filter(q => state.submitted[q.id]).length;
  const autoGradable = state.pool.filter(q => q.answer.length).length;
  const correct = correctCount();
  const score = autoGradable ? Math.round((correct / autoGradable) * 1000) : 0;

  els.exam.classList.add("hidden");
  els.results.classList.remove("hidden");
  els.resultTitle.textContent = score >= 700 ? "通過練習門檻" : "需要再複習";
  const used = formatTime(state.durationSeconds - state.remainingSeconds);
  els.resultNote.textContent = `已作答 ${submitted} / ${state.pool.length} 題；自動判分題 ${autoGradable} 題，答對 ${correct} 題。作答時間 ${used}。Hotspot/Drag Drop 不列入分數。`;
  els.scoreNumber.textContent = score;
  els.scoreNumber.classList.toggle("fail", score < 700);
  renderWrongList();
}

function renderWrongList() {
  const wrong = state.pool.filter(q => state.submitted[q.id] && !isCorrect(q));
  els.wrongList.innerHTML = wrong.map(q => `
    <article class="question-card wrong">
      <div class="question-meta">Topic ${q.topic} · Question #${q.id}</div>
      <div class="question-title">錯題回顧</div>
      <div class="question-text">${escapeHtml(q.question)}</div>
      <div class="answer-panel show">
        <div class="answer-line">答案：${escapeHtml(answerLabel(q))}</div>
        <div class="comment-box">${escapeHtml(answerText(q))}</div>
      </div>
    </article>
  `).join("") || `<p>目前沒有錯題。</p>`;
}

els.form.addEventListener("submit", event => {
  event.preventDefault();
  openAccessModal(() => startExam(els.mode.value === "sequential" ? "random" : els.mode.value, Number(els.count.value), false, Number(els.duration.value)));
});

els.prev.addEventListener("click", () => { state.index -= 1; renderQuestion(); });
els.next.addEventListener("click", () => { state.index += 1; renderQuestion(); });
els.finish.addEventListener("click", finishExam);
els.showAnswer.addEventListener("click", () => document.querySelector("#answer-panel").classList.toggle("show"));
els.mark.addEventListener("click", () => {
  const q = currentQuestion();
  state.flagged[q.id] = !state.flagged[q.id];
  renderQuestion();
});
els.submit.addEventListener("click", () => {
  const q = currentQuestion();
  state.submitted[q.id] = true;
  renderQuestion();
});
els.reviewWrong.addEventListener("click", () => {
  const wrong = state.pool.filter(q => state.submitted[q.id] && !isCorrect(q));
  if (wrong.length) {
    Object.assign(state, { pool: wrong, index: 0, answers: {}, submitted: {}, flagged: {} });
    state.remainingSeconds = state.durationSeconds;
    els.results.classList.add("hidden");
    els.exam.classList.remove("hidden");
    els.floatingTimer.classList.remove("hidden");
    startTimer();
    renderQuestion();
  }
});
els.restart.addEventListener("click", () => {
  els.results.classList.add("hidden");
  els.setup.classList.remove("hidden");
});

accessEls.input.addEventListener("input", updatePinDots);
accessEls.input.addEventListener("keydown", event => {
  if (event.key === "Enter") unlockExam();
  if (event.key === "Escape") closeAccessModal();
});
accessEls.unlock.addEventListener("click", unlockExam);
accessEls.cancel.addEventListener("click", closeAccessModal);
accessEls.close.addEventListener("click", closeAccessModal);
accessEls.modal.addEventListener("click", event => {
  if (event.target === accessEls.modal) closeAccessModal();
  else if (!event.target.closest("button")) accessEls.input.focus();
});

updateHeader();
