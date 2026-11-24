(() => {
  const config = window.DUANPIAN_CONFIG || {};
  const enabled = Boolean(config.supabaseUrl && config.supabaseAnonKey);
  const cloudStatus = document.createElement("div");
  cloudStatus.id = "cloud-status";
  cloudStatus.style.cssText =
    "text-align:center;font-size:12px;color:var(--ink3);margin:10px 0 0";
  const stat = document.getElementById("stat");
  if (stat && stat.parentNode) stat.parentNode.insertBefore(cloudStatus, stat);
  cloudStatus.textContent = enabled ? "正在连接云端书库…" : "云端未配置";

  async function rpc(name, body = {}) {
    if (!enabled) throw new Error("Supabase is not configured");
    const response = await fetch(
      `${config.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/${name}`,
      {
        method: "POST",
        headers: {
          apikey: config.supabaseAnonKey,
          Authorization: `Bearer ${config.supabaseAnonKey}`,
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
        body: JSON.stringify(body),
        cache: "no-store",
      },
    );
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Supabase ${response.status}: ${detail.slice(0, 260)}`);
    }
    return response.json();
  }

  function remoteBook(row) {
    const scene = row.best_scene || {};
    const matchedTags = [...new Set(row.matched_tags || [])];
    return {
      id: `cloud-${row.id}`,
      t: row.title,
      a: row.aliases || [],
      au: row.author || "作者未知",
      g: row.genre || "未分类",
      s: row.sub_genre || "待细分",
      y: row.year_min || null,
      p: row.platform || "来源未标注",
      w: Math.round((row.word_count || 0) / 10000),
      end: row.ending || "未知",
      st: "",
      ch: [],
      wt: row.world_tags || [],
      hi: row.female_roles || [],
      ho: row.male_roles || [],
      rl: row.relationships || [],
      sc: scene.snippet
        ? [
            {
              t: String(scene.snippet).slice(0, 280),
              ta: scene.tags || [],
              po: scene.ch_title || `第${scene.ch_no || ""}章`,
              w: Number(scene.weight || 0.5),
            },
          ]
        : [],
      q: [],
      cv: "",
      f: 0,
      cl: "",
      _remote: true,
      _tags: matchedTags,
      _matched: row.matched || {},
    };
  }

  function remoteResult(row) {
    const b = remoteBook(row);
    const score = Number(row.score || 0);
    return {
      b,
      r: {
        s: score,
        pct: Math.max(28, Math.min(98, Math.round(35 + score))),
        ev: row.evidence || ["云端原文与标签命中"],
        best: b.sc[0] || null,
      },
    };
  }

  async function hydrateStats() {
    if (!enabled) return;
    try {
      const stats = await rpc("corpus_stats");
      const line = `云端检索 · ${Number(stats.books || 0).toLocaleString("zh-CN")} 本书 · ${Number(stats.scenes || 0).toLocaleString("zh-CN")} 条场景`;
      if (stat) stat.textContent = line;
      const kpis = document.getElementById("kpis");
      if (kpis) {
        kpis.innerHTML = [
          [`${Number(stats.books || 0).toLocaleString("zh-CN")} 本`, "云端书目"],
          [`${Number(stats.scenes || 0).toLocaleString("zh-CN")} 条`, "原文场景"],
          ["14 组", "白名单标签"],
          [`${Number(stats.terms || 0).toLocaleString("zh-CN")} 个`, "专名候选"],
        ]
          .map(
            ([value, label]) =>
              `<div class="fbox"><div class="ft">${label}</div><div style="font-family:'Noto Serif SC',serif;font-size:22px;font-weight:900">${value}</div></div>`,
          )
          .join("");
      }
      BOOKS = [];
      cloudStatus.textContent = "云端书库已连接 · 检索使用真实测试数据";
      cloudStatus.style.color = "var(--green)";
    } catch (error) {
      console.error(error);
      cloudStatus.textContent = "云端连接失败";
      cloudStatus.style.color = "var(--red)";
    }
  }

  window.searchByForm = async function searchByFormCloud() {
    const o = collectForm();
    const used = filledList(o);
    if (!used.length) {
      alert("至少填一项，或从「更多条件」里选一个标签");
      return;
    }
    const q = [o.scene, o.fem, o.male, o.other, o.call, o.mark, o.terms]
      .filter(Boolean)
      .join(" ");
    const inferred = inferTags(q);
    if (!enabled) {
      alert("云端数据库未配置");
      return;
    }
    const payload = {
      p_scene: o.scene || "",
      p_main: o.main || "",
      p_sub: (SEL.sub || [])[0] || "",
      p_world: (SEL.world || [])[0] || "",
      p_era: (SEL.era || [])[0] || "",
      p_space: (SEL.space || [])[0] || "",
      p_female_role: (SEL.femRole || [])[0] || "",
      p_male_role: (SEL.maleRole || [])[0] || "",
      p_rolefunc: (SEL.rolefunc || [])[0] || "",
      p_villain: (SEL.villain || [])[0] || "",
      p_rel: (SEL.rel || [])[0] || "",
      p_plot: (SEL.plot || [])[0] || "",
      p_mood: (SEL.mood || [])[0] || "",
      p_tags: [...new Set(selFlat())],
      p_inferred: [...new Set(inferred)],
      p_fem: o.fem || "",
      p_male: o.male || "",
      p_other: o.other || "",
      p_call: o.call || "",
      p_mark: o.mark || "",
      p_terms: o.terms || "",
      p_year: o.year ? Number(o.year) : null,
      p_title_len: o.titlelen ? Number(o.titlelen) : null,
      p_source: o.source || "",
    };
    try {
      cloudStatus.textContent = "正在检索云端原文…";
      const rows = await rpc("search_books", payload);
      ST.genre = o.main || null;
      ST.ending = null;
      ST.cands = (rows || []).map(remoteResult);
      BOOKS = ST.cands.map((item) => item.b);
      renderRes(q, inferred, selFlat());
      document.getElementById("resMeta").textContent =
        `已填 ${used.length} 项 · ${ST.cands.length ? "按云端证据排序" : "没有足够接近的结果"}`;
      cloudStatus.textContent = "云端检索完成";
      go("res");
    } catch (error) {
      console.error(error);
      ST.cands = [];
      renderRes(q, inferred, selFlat());
      cloudStatus.textContent = "云端检索失败，请稍后重试";
    }
  };

  window.excludeBook = function excludeCloudBook(id) {
    ST.cands = ST.cands.filter((item) => item.b.id !== id);
    BOOKS = ST.cands.map((item) => item.b);
    const o = collectForm();
    const q = [o.scene, o.fem, o.male, o.other, o.call, o.mark, o.terms]
      .filter(Boolean)
      .join(" ");
    renderRes(q, inferTags(q), selFlat());
    document.getElementById("resMeta").textContent =
      `已排除一本 · 剩余 ${ST.cands.length} 个候选`;
  };

  window.openDrawer = function openCloudDrawer(id) {
    const book = BOOKS.find((item) => item.id === id);
    if (!book) return;
    const panel = document.getElementById("dpanel");
    const drawer = document.getElementById("drawer");
    if (!panel || !drawer) return;
    const kv = (key, value) =>
      `<div class="kv"><div class="k">${key}</div><div class="v">${value}</div></div>`;
    const tags = (values) =>
      values && values.length
        ? values.map((value) => `<span class="tag">${esc(value)}</span>`).join("")
        : '<span style="color:var(--ink3)">未标注</span>';
    const aliases = (book.a || []).length ? tags(book.a) : "暂无";
    const scene = (book.sc || [])[0];
    panel.innerHTML = `
      <button class="dclose" onclick="closeDrawer()">×</button>
      <h2>《${esc(book.t)}》</h2>
      <div class="dm">${esc(book.au)} · ${esc(book.g)} / ${esc(book.s)} · ${yearLabel(book.y)} · ${esc(book.p)}</div>
      <div class="sec-t">A 书元信息</div>
      ${kv("现用书名", esc(book.t))}
      ${kv("曾用名", aliases)}
      ${kv("作者", esc(book.au))}
      ${book.w ? kv("总字数", `${book.w} 万字`) : ""}
      ${book.y ? kv("发文年份", `${book.y}（弱证据）`) : ""}
      ${book.p && book.p !== "来源未标注" ? kv("平台 / 来源", esc(book.p)) : ""}
      <div class="sec-t">B 题材与命中标签</div>
      ${kv("主类型", esc(book.g))}
      ${book.s && book.s !== "待细分" ? kv("二级子类", esc(book.s)) : ""}
      ${kv("本次命中", tags(book._tags))}
      ${
        scene
          ? `<div class="sec-t">C 原文桥段</div>
             <div class="sc"><p>${esc(scene.t)}</p><div class="st"><span class="tag">${esc(scene.po)}</span></div></div>`
          : ""
      }
      <div class="note">详情只展示云端已有且可用于判断的字段；缺失的作者年份、结局等信息不会伪造。</div>`;
    drawer.classList.add("on");
  };

  window.quickFilter = async function quickFilterCloud(kind, value) {
    if (kind === "ending") {
      alert("当前样品库还没有可靠的结局标注，请改用情节或人物线索。");
      return;
    }
    document
      .querySelectorAll('[data-g="main"]')
      .forEach((chip) => chip.classList.remove("on"));
    const chip = [...document.querySelectorAll('[data-g="main"]')].find(
      (item) => item.dataset.v === value,
    );
    if (chip) chip.classList.add("on");
    await window.searchByForm();
  };

  window.hq = function renderCloudFollowUp() {
    const extra = document.getElementById("resExtra");
    if (!extra) return;
    extra.innerHTML = `
      <div class="sl" style="margin-bottom:8px">再补一条更具体的情节或人物线索</div>
      <div class="chips">
        <button class="sg" onclick="document.getElementById('f_scene').focus()">补情节</button>
        <button class="sg" onclick="document.getElementById('f_other').focus()">补配角名</button>
        <button class="sg" onclick="document.getElementById('f_terms').focus()">补专有名词</button>
      </div>
      <div style="margin-top:12px">
        <button class="btn2" onclick="openPostFromQuery()">都不对，发寻书帖</button>
      </div>`;
  };

  async function loadPosts() {
    if (!enabled) return;
    try {
      const rows = await rpc("list_requests");
      if (!Array.isArray(rows)) return;
      POSTS.splice(
        0,
        POSTS.length,
        ...rows.map((row) => ({
          id: row.id,
          t: `“${row.clue}”`,
          g: row.genre || "未分类",
          x: "云端寻书帖",
          v: Number(row.view_count || 0),
          notes: row.notes || [],
          status: row.status || "等待认领",
        })),
      );
      renderPosts();
    } catch (error) {
      console.error(error);
    }
  }

  window.addPost = async function addPostCloud() {
    const input = document.getElementById("postText");
    const text = (input?.value || "").trim();
    if (!text) {
      alert("先写一句线索");
      return;
    }
    try {
      await rpc("create_request", {
        p_clue: text,
        p_genre: POSTG || "未分类",
      });
      input.value = "";
      await loadPosts();
      alert("寻书帖已发布到云端");
    } catch (error) {
      console.error(error);
      alert("发布失败，请稍后重试");
    }
  };

  window.submitNote = async function submitNoteCloud(id) {
    const input = document.getElementById(`ni-${id}`);
    const note = (input?.value || "").trim();
    if (!note) {
      alert("先写一句线索");
      return;
    }
    try {
      await rpc("add_request_note", { p_id: id, p_note: note });
      await loadPosts();
    } catch (error) {
      console.error(error);
      alert("线索提交失败");
    }
  };

  hydrateStats();
  loadPosts();
})();
