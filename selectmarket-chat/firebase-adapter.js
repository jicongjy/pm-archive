// 셀렉트마켓 채팅 · Firebase 연결 (배포 주소에서만 쓰임)
// 브라우저 임시 저장소(로컬 스토리지)에 있던 대화 기록·지침·스토어 표를 Firebase(Firestore)로 옮긴다.
// firebase-config.js 가 없으면 아무것도 하지 않는다 → 로컬 서버·아티팩트에서는 기존 방식 그대로.
(function () {
  const cfg = window.SMC_FIREBASE_CONFIG;
  if (!cfg) return;
  const B = "https://www.gstatic.com/firebasejs/11.0.2/";
  let M = null, auth, db, cb = null, lastAdmin = null;
  const strip = o => JSON.parse(JSON.stringify(o));

  async function load() {
    if (M) return M;
    const [app, au, fs] = await Promise.all([import(B + "firebase-app.js"), import(B + "firebase-auth.js"), import(B + "firebase-firestore.js")]);
    const a = app.initializeApp(cfg);
    auth = au.getAuth(a); db = fs.getFirestore(a);
    return (M = { au, fs });
  }
  async function isAdmin(user) {
    if (!user || user.isAnonymous || !user.email) return false;
    try { return (await M.fs.getDoc(M.fs.doc(db, "admins", user.email))).exists(); } catch (e) { return false; }
  }

  window.SMC_FB = {
    // 로그인 상태가 바뀔 때마다 onAdmin(true/false) 호출. 손님은 익명 로그인으로 자기 대화만 남긴다.
    async init(onAdmin) {
      await load(); cb = onAdmin;
      await new Promise(resolve => {
        let first = true;
        M.au.onAuthStateChanged(auth, async user => {
          if (!user) { try { await M.au.signInAnonymously(auth); } catch (e) { if (first) { first = false; resolve(); } } return; }
          const a = await isAdmin(user);
          if (a !== lastAdmin) { lastAdmin = a; if (cb) cb(a); }
          if (first) { first = false; resolve(); }
        });
      });
    },
    login() { return M.au.signInWithPopup(auth, new M.au.GoogleAuthProvider()); },
    logout() { return M.au.signOut(auth); },

    // 대화 기록: create(처음 저장) / report(사용자 신고) / fb(관리자 피드백)
    async setLog(e, mode) {
      const { fs } = M, ref = fs.doc(db, "chatlogs", e.id);
      try {
        if (mode === "create") await fs.setDoc(ref, strip(Object.assign({}, e, { uid: auth.currentUser.uid })));
        else if (mode === "report") await fs.updateDoc(ref, strip({ report: e.report }));
        else await fs.updateDoc(ref, strip({ fb: e.fb, report: e.report }));
      } catch (err) { console.warn("대화 기록 저장 실패", err); throw err; }
    },
    async loadLogs() {
      const { fs } = M, q = fs.query(fs.collection(db, "chatlogs"), fs.orderBy("at", "desc"), fs.limit(500));
      return (await fs.getDocs(q)).docs.map(d => d.data()).reverse();
    },
    async clearLogs() {
      const { fs } = M;
      for (;;) {
        const snap = await fs.getDocs(fs.query(fs.collection(db, "chatlogs"), fs.limit(400)));
        if (snap.empty) return;
        const b = fs.writeBatch(db); snap.docs.forEach(d => b.delete(d.ref)); await b.commit();
      }
    },

    // 운영자 지침
    async loadRules() { const d = await M.fs.getDoc(M.fs.doc(db, "config", "guidelines")); return d.exists() && Array.isArray(d.data().items) ? d.data().items : []; },
    saveRules(items) { return M.fs.setDoc(M.fs.doc(db, "config", "guidelines"), strip({ items, updatedAt: Date.now() })); },

    // 스토어 표(상품·재고·주문·배송)
    async loadStore() { const o = {}; (await M.fs.getDocs(M.fs.collection(db, "store"))).docs.forEach(d => { o[d.id] = d.data().items; }); return o; },
    saveStore(name, items) { return M.fs.setDoc(M.fs.doc(db, "store", name), strip({ items })); }
  };
})();
