// REACT project page behaviour. Plain JS, no dependencies.
(function () {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasIO = "IntersectionObserver" in window;

  // If autoplay is refused (Low Power Mode, data saver, reduced motion), fall back to native controls.
  function tryPlay(v) {
    if (reduceMotion) { v.controls = true; return; }
    const p = v.play();
    if (p && p.catch) p.catch(() => { v.controls = true; });
  }
  function toggleOnClick(v) {
    v.addEventListener("click", () => {
      if (v.controls) return; // native controls handle clicks themselves
      if (v.paused) tryPlay(v); else v.pause();
    });
  }

  // Typeset \( inline \) and \[ display \] math with the self-hosted KaTeX (deferred scripts run before DOMContentLoaded).
  document.addEventListener("DOMContentLoaded", () => {
    if (!window.renderMathInElement) return;
    window.renderMathInElement(document.body, {
      delimiters: [
        { left: "\\[", right: "\\]", display: true },
        { left: "\\(", right: "\\)", display: false },
      ],
      ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"],
      throwOnError: false,
    });
  });

  // Header buttons with an empty href are not ready yet; hide them.
  document.querySelectorAll("a[data-link]").forEach((a) => {
    if (!a.getAttribute("href")) a.remove();
  });

  // ---------- Simulation grid ----------
  const simGrid = document.getElementById("sim-grid");
  if (simGrid) {
    simGrid.dataset.tasks.split(",").forEach((entry) => {
      const [task, name] = entry.split(":");
      const fig = document.createElement("figure");
      fig.className = "vcell";
      const v = document.createElement("video");
      v.className = "lazy";
      ["muted", "loop", "playsinline"].forEach((a) => v.setAttribute(a, ""));
      v.muted = true;
      v.preload = "none";
      v.dataset.task = task;
      v.poster = `static/videos/sim_${task}_world.jpg`;
      v.dataset.src = `static/videos/sim_${task}_world.mp4`;
      v.setAttribute("aria-label", `${name} rollout`);
      const cap = document.createElement("figcaption");
      cap.textContent = name;
      fig.append(v, cap);
      simGrid.append(fig);
    });

    const segs = document.querySelectorAll(".view-toggle .seg");
    segs.forEach((btn) => {
      btn.addEventListener("click", () => {
        segs.forEach((b) => {
          b.classList.toggle("active", b === btn);
          b.setAttribute("aria-pressed", String(b === btn));
        });
        const view = btn.dataset.view;
        simGrid.querySelectorAll("video").forEach((v) => {
          v.poster = `static/videos/sim_${v.dataset.task}_${view}.jpg`;
          v.dataset.src = `static/videos/sim_${v.dataset.task}_${view}.mp4`;
          if (v.dataset.loaded === "1") {
            v.src = v.dataset.src;
            if (v._visible) tryPlay(v);
          }
        });
      });
    });
  }

  // ---------- Lazy, visibility-driven playback for looping grids ----------
  const lazyVideos = document.querySelectorAll("video.lazy");
  lazyVideos.forEach(toggleOnClick);
  if (hasIO) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(({ target: v, isIntersecting }) => {
        v._visible = isIntersecting;
        if (isIntersecting) {
          if (v.dataset.loaded !== "1") {
            v.src = v.dataset.src;
            v.dataset.loaded = "1";
          }
          if (!v._userPaused) tryPlay(v);
        } else if (!v.paused) {
          v.pause();
        }
      });
    }, { rootMargin: "120px 0px", threshold: 0.15 });
    lazyVideos.forEach((v) => {
      v.addEventListener("pause", () => { if (v._visible) v._userPaused = true; });
      v.addEventListener("play", () => { v._userPaused = false; });
      io.observe(v);
    });
  } else {
    lazyVideos.forEach((v) => { v.src = v.dataset.src; v.dataset.loaded = "1"; v.controls = true; });
  }

  // ---------- Synchronized comparisons ----------
  function playGroup(name) {
    const vids = document.querySelectorAll(`[data-sync-group="${name}"] video`);
    vids.forEach((v) => { v.currentTime = 0; });
    vids.forEach(tryPlay);
  }
  document.querySelectorAll(".play-all").forEach((btn) => {
    btn.addEventListener("click", () => playGroup(btn.dataset.syncTarget));
  });
  document.querySelectorAll("[data-sync-group] video").forEach(toggleOnClick);
  // Play each comparison once, together, the first time its first video is mostly in view.
  if (hasIO && !reduceMotion) {
    const once = new IntersectionObserver((entries, obs) => {
      entries.forEach(({ target, isIntersecting }) => {
        if (!isIntersecting) return;
        playGroup(target.closest("[data-sync-group]").dataset.syncGroup);
        obs.unobserve(target);
      });
    }, { threshold: 0.5 });
    document.querySelectorAll("[data-sync-group]").forEach((g) => once.observe(g.querySelector("video")));
  }

  // ---------- Rolling-buffer animation ----------
  const track = document.getElementById("roll-track");
  const toggle = document.getElementById("roll-toggle");
  const obsChip = document.getElementById("roll-obs");
  if (track) {
    const K = 5;
    // Same order as the Overview figure: the block executed next is cyan, the noisy tail red.
    const COLORS = ["#22b8e6", "#4cbb3a", "#6a2fa0", "#f5b400", "#f0505a"];
    let next = 0;
    let t = 0;
    // Each block carries its flow time tau; position k starts at tau = (k + 1) / K.
    let blocks = Array.from({ length: K }, (_, k) => ({ id: next++, tau: (k + 1) / K }));
    const els = new Map();

    function elFor(b) {
      let el = els.get(b.id);
      if (!el) {
        el = document.createElement("div");
        el.className = "blk";
        el.style.setProperty("--c", COLORS[b.id % COLORS.length]);
        el.append(document.createElement("span"));
        els.set(b.id, el);
        track.append(el);
      }
      return el;
    }
    function render() {
      blocks.forEach((b, i) => {
        const el = elFor(b);
        el.style.setProperty("--i", i);
        el.style.setProperty("--clean", (1 - b.tau).toFixed(2));
        el.style.setProperty("--grain", (0.55 * b.tau).toFixed(2));
        el.firstChild.textContent = "τ=" + b.tau.toFixed(1);
      });
    }
    function setObs() {
      obsChip.innerHTML = `observation o<sub>${t === 0 ? "t" : "t+" + t}</sub>`;
    }

    // One tick = three phases driven by a single cancellable timeout chain.
    let phase = 0;
    let timer = null;
    function step() {
      if (phase === 0) {          // 1) newest observation arrives; one Euler step on every block
        t += 1; setObs();
        obsChip.classList.add("flash");
        blocks = blocks.map((b) => ({ ...b, tau: Math.max(0, b.tau - 1 / K) }));
        render();
        timer = setTimeout(step, 700);
      } else if (phase === 1) {   // 2) execute the clean front block
        obsChip.classList.remove("flash");
        const front = els.get(blocks[0].id);
        front.classList.add("exec");
        timer = setTimeout(step, 450);
      } else {                    // 3) shift forward, append pure noise at the tail
        const gone = blocks.shift();
        els.get(gone.id).remove();
        els.delete(gone.id);
        const fresh = { id: next++, tau: 1 };
        blocks.push(fresh);
        render();
        const el = els.get(fresh.id);
        el.classList.add("enter");
        void el.offsetWidth; // commit the start state so removing the class animates the fade-in
        el.classList.remove("enter");
        timer = setTimeout(step, 900);
      }
      phase = (phase + 1) % 3;
    }

    let userPaused = reduceMotion;
    let onScreen = true;
    const run = () => { if (!timer) step(); };
    const halt = () => { clearTimeout(timer); timer = null; };
    const sync = () => { (!userPaused && onScreen && !document.hidden) ? run() : halt(); };
    const label = () => {
      toggle.textContent = userPaused ? "Play" : "Pause";
      toggle.setAttribute("aria-pressed", String(userPaused));
    };
    toggle.addEventListener("click", () => { userPaused = !userPaused; label(); sync(); });
    document.addEventListener("visibilitychange", sync);
    if (hasIO) {
      new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); }).observe(track);
    }
    setObs();
    render();
    label();
    sync();
  }

  // ---------- Copy BibTeX ----------
  const status = document.getElementById("copy-status");
  document.querySelectorAll("button[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const pre = document.getElementById(btn.dataset.copy);
      let msg;
      try {
        await navigator.clipboard.writeText(pre.innerText);
        msg = "Copied";
      } catch (e) {
        const range = document.createRange();
        range.selectNodeContents(pre);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        let ok = false;
        try { ok = document.execCommand("copy"); } catch (_) { /* ignore */ }
        msg = ok ? "Copied" : "Press Ctrl/⌘+C";
      }
      btn.textContent = msg;
      if (status) status.textContent = msg;
      clearTimeout(btn._t);
      btn._t = setTimeout(() => { btn.textContent = "Copy"; if (status) status.textContent = ""; }, 1600);
    });
  });
})();
