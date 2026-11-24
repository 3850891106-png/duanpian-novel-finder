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
        },
        body: JSON.stringify(body),
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
    const tags = [...new Set([...(row.tags || []), ...(scene.tags || [])])];
    const characters = (row.characters || scene.chars || []).map((name, index) => ({
      n: name,
      r: index === 0 ? "角色" : "相关角色",
      c: [...name],
      k: "",
    }));
    return {
      id: `cloud-${row.id}`,
      t: row.title,
      a: row.aliases || [],
      au: row.author || "作者未知",
      g: row.genre || "未分类",
      s: row.sub_genre || "待细分",
      y: row.year_min || 0,
      p: row.platform || "来源待补",
      w: Math.round((row.word_count || 0) / 10000),
      end: row.ending || "未知",
      st: "",
      ch: characters,
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
      _tags: tags,
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
      p_tags: [...new Set([...selFlat(), ...inferred])],
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
