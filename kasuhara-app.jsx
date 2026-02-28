import React, { useState, useEffect, useCallback, useRef } from "react";

const API_MODEL = "claude-sonnet-4-20250514";

const Storage = {
  async get(key) { try { const r = await window.storage.get(key); return r ? JSON.parse(r.value) : null; } catch { return null; } },
  async set(key, value) { try { await window.storage.set(key, JSON.stringify(value)); return true; } catch { return false; } },
  async delete(key) { try { await window.storage.delete(key); return true; } catch { return false; } },
  async list(prefix) { try { const r = await window.storage.list(prefix); return r?.keys || []; } catch { return []; } }
};

const MONTHLY_AI_LIMIT = 100;

const Logo=({size="md",light=false})=>{
  const sizes={sm:{main:14,sub:9,gap:3,dot:5},md:{main:22,sub:12,gap:4,dot:7},lg:{main:28,sub:14,gap:5,dot:9}};
  const s=sizes[size]||sizes.md;
  const c=light?{main:"#F5E6C8",accent:"#A09888",dot:"#C4A35A"}:{main:"#2C2418",accent:"#8C7E6A",dot:"#C4A35A"};
  return(<div style={{display:"inline-flex",alignItems:"baseline",gap:s.gap+"px"}}>
    <span style={{fontSize:s.main+"px",fontWeight:800,color:c.main,fontFamily:"'Zen Kaku Gothic New','Noto Sans JP',sans-serif",letterSpacing:"-0.5px",lineHeight:1}}>トーカス</span>
    <span style={{fontSize:s.sub+"px",fontWeight:700,color:c.accent,fontFamily:"'Inter',sans-serif",letterSpacing:"1px",lineHeight:1}}>AI</span>
    <span style={{width:s.dot+"px",height:s.dot+"px",borderRadius:"50%",background:c.dot,display:"inline-block",marginLeft:"-1px",marginBottom:"1px",flexShrink:0}}/>
  </div>);
};

const KASUHARA_CRITERIA = {
  youkyu_taiyo: { label: "要求態様", items: ["侮辱的な暴言・差別的・性的な言動を伴う", "暴力や脅迫を伴う苦情である", "恐怖心を与える口調・大声・攻撃的意図がある", "従業員の顔等を無断撮影・SNS公開する行為"] },
  youkyu_naiyou: { label: "要求内容", items: ["不当な金品の要求がある", "土下座での謝罪の要求がある", "書面での謝罪の要求がある", "従業員の解雇の要求がある", "社会通念上相当な範囲を超える対応の強要"] },
  jikan_kaisu: { label: "時間・回数・頻度", items: ["迷惑行為が30分以上継続している", "退去命令を2回以上したにも関わらず居座り続けている", "対応不可の要求が3回以上続いている", "業務時間外の早朝・深夜に苦情がある"] }
};

const MEIWAKU_TYPES = ["暴力行為","暴言・侮辱・誹謗中傷","威嚇・脅迫","人格否定・差別的発言","土下座の要求","長時間拘束","過剰な対応の強要","不当・過剰な要求","SNS等への信用棄損投稿","セクハラ・ストーキング","その他"];

const getSeverityColor = (level) => {
  if (level >= 80) return { bg: "#B91C1C", text: "#FFF", label: "危険：即時対応必要" };
  if (level >= 60) return { bg: "#C2410C", text: "#FFF", label: "高：組織対応必要" };
  if (level >= 40) return { bg: "#B45309", text: "#FFF", label: "中：注意して対応" };
  if (level >= 20) return { bg: "#1D4ED8", text: "#FFF", label: "低：通常クレーム" };
  return { bg: "#15803D", text: "#FFF", label: "正常：適切な要望" };
};

const MEMBERSHIP_TYPES = [
  { id: "support", label: "サポート会員", color: "#64748B", bg: "#F1F5F9", duration: null, desc: "アプリ利用なし" },
  { id: "app_7m", label: "アプリ7か月会員", color: "#1D4ED8", bg: "#DBEAFE", duration: 7, desc: "入会日より7か月間" },
  { id: "app_1y", label: "アプリ1年会員", color: "#6D28D9", bg: "#EDE9FE", duration: 12, desc: "入会日より1年間" },
  { id: "app_monthly", label: "アプリ月額会員", color: "#047857", bg: "#D1FAE5", duration: null, desc: "自動移行後の月額継続" },
];

function getMembershipInfo(user) {
  const type = MEMBERSHIP_TYPES.find(t => t.id === user.membershipType) || MEMBERSHIP_TYPES[0];
  const now = new Date(); let expiryDate = null, daysLeft = null, status = "active";
  if (user.membershipType === "support") status = "support";
  else if (user.membershipType === "app_monthly") status = "monthly";
  else if (user.enrollmentDate && type.duration) {
    const enroll = new Date(user.enrollmentDate); expiryDate = new Date(enroll);
    expiryDate.setMonth(expiryDate.getMonth() + type.duration);
    daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / 86400000);
    status = daysLeft <= 0 ? "expired" : daysLeft <= 30 ? "expiring" : "active";
  }
  return { type, expiryDate, daysLeft, status };
}

const STATUS_MAP = {
  active: { label: "契約中", bg: "#DCFCE7", color: "#15803D" },
  expiring: { label: "期限間近", bg: "#FEF3C7", color: "#B45309" },
  expired: { label: "期限切れ", bg: "#FEE2E2", color: "#B91C1C" },
  monthly: { label: "月額継続", bg: "#D1FAE5", color: "#047857" },
  support: { label: "サポート", bg: "#F1F5F9", color: "#64748B" },
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700;800&family=Inter:wght@300;400;500;600;700;800&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeInSlow{from{opacity:0}to{opacity:1}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes rec{0%,100%{opacity:1}50%{opacity:.3}}
@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.6}}
input:focus,textarea:focus,select:focus{outline:none;border-color:#C4A35A!important;box-shadow:0 0 0 3px rgba(196,163,90,0.1)!important;transition:all 0.2s ease}
input,textarea,select{transition:border-color 0.2s ease,box-shadow 0.2s ease}
button{transition:all 0.15s ease}
button:hover{opacity:0.88}
button:active{transform:scale(0.97)}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#D4C4A8;border-radius:3px}::-webkit-scrollbar-thumb:hover{background:#B8A888}
textarea{resize:vertical}
::selection{background:rgba(196,163,90,0.15)}
`;

export default function KasuharaApp() {
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState("login");
  useEffect(() => { (async () => { const s = await Storage.get("session"); if (s) setCurrentUser(s); setIsLoading(false); })(); }, []);
  const handleLogin = async (u) => { const prev=await Storage.get(`lastlogin_${u.userId}`); u.lastLogin=prev||null; await Storage.set(`lastlogin_${u.userId}`,new Date().toISOString()); setCurrentUser(u); await Storage.set("session", u); };
  const handleLogout = async () => { setCurrentUser(null); await Storage.delete("session"); setPage("login"); };

  if (isLoading) return (<div style={S.loadingScreen}><style>{CSS}</style><div style={{textAlign:"center"}}><Logo size="lg" light/><div style={{color:"#8C7E6A",fontSize:"11px",fontWeight:500,marginTop:"14px",letterSpacing:"3px"}}>LOADING</div></div></div>);
  if (!currentUser) { if(page==="signup") return <SignupPage onBack={()=>setPage("login")}/>; return <LoginScreen onLogin={handleLogin} onSignup={()=>setPage("signup")}/>; }
  return currentUser.role === "admin" ? <AdminDashboard user={currentUser} onLogout={handleLogout} /> : <UserDashboard user={currentUser} onLogout={handleLogout} />;
}

function LoginScreen({ onLogin, onSignup }) {
  const [userId, setUserId] = useState(""); const [password, setPassword] = useState("");
  const [error, setError] = useState(""); const [showPass, setShowPass] = useState(false);
  const handleSubmit = async () => {
    setError(""); let admin = await Storage.get("admin_account");
    if (!admin) { admin = {userId:"admin",password:"admin123",name:"管理者",role:"admin"}; await Storage.set("admin_account", admin); }
    if (userId === admin.userId && password === admin.password) { onLogin(admin); return; }
    const users = await Storage.get("user_accounts") || [];
    const found = users.find(u => u.userId === userId && u.password === password && u.active);
    if (found) { onLogin(found); return; }
    setError("ユーザーIDまたはパスワードが正しくありません");
  };
  return (
    <div style={S.loginBg}><style>{CSS}</style>
      <div style={S.loginCard}>
        <div style={{textAlign:"center",marginBottom:"32px"}}>
          <Logo size="lg" light/>
          <div style={{fontSize:"13px",fontWeight:500,color:"#7C8DA6",marginTop:"12px",letterSpacing:"0.5px"}}>東京都カスハラ防止 申請サポート</div>
          <div style={{fontSize:"10px",color:"#4A5568",marginTop:"6px",letterSpacing:"2px"}}>TOKASU AI — SUPPORT SYSTEM</div>
        </div>
        {error && <div style={S.errorMsg}>{error}</div>}
        <div style={S.inputGroup}><label style={S.labelDark}>ユーザーID</label><input style={S.inputDark} value={userId} onChange={e=>setUserId(e.target.value)} placeholder="ID" onKeyDown={e=>e.key==="Enter"&&handleSubmit()} /></div>
        <div style={S.inputGroup}><label style={S.labelDark}>パスワード</label><div style={{position:"relative"}}><input style={S.inputDark} type={showPass?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" onKeyDown={e=>e.key==="Enter"&&handleSubmit()} /><button style={S.eyeBtn} onClick={()=>setShowPass(!showPass)}>{showPass?"非表示":"表示"}</button></div></div>
        <button style={S.loginBtn} onClick={handleSubmit}>ログイン</button>
        <div style={{textAlign:"center",marginTop:"16px"}}><button onClick={onSignup} style={{background:"none",border:"none",color:"#8B6914",fontSize:"12px",cursor:"pointer",fontFamily:"'Noto Sans JP',sans-serif",textDecoration:"underline"}}>アカウント新規申し込みはこちら</button></div>
        <div style={{textAlign:"center",marginTop:"16px",fontSize:"10px",color:"#5A6B82",letterSpacing:"0.3px"}}>東京都カスタマー・ハラスメント防止条例対応</div>
      </div>
    </div>
  );
}

function SignupPage({ onBack }) {
  const [form,setForm]=useState({companyName:"",rep:"",email:"",phone:"",bizType:"",empCount:"",address:"",message:""});
  const [submitted,setSubmitted]=useState(false);const [refCode,setRefCode]=useState("");
  const uf=(k,v)=>setForm(p=>({...p,[k]:v}));
  useEffect(()=>{try{const p=new URLSearchParams(window.location.search);const r=p.get("ref");if(r)setRefCode(r);}catch{}},[]);
  const handleSubmit=async()=>{
    if(!form.companyName||!form.rep||!form.email){alert("会社名・担当者名・メールは必須です");return;}
    const apps=await Storage.get("signup_applications")||[];
    apps.push({...form,refCode,date:new Date().toISOString(),status:"pending",id:`APP${Date.now()}`});
    await Storage.set("signup_applications",apps);
    if(refCode){const refs=await Storage.get("affiliate_referrals")||[];refs.push({refCode,appEmail:form.email,company:form.companyName,date:new Date().toISOString(),status:"pending",reward:10000});await Storage.set("affiliate_referrals",refs);}
    setSubmitted(true);
  };
  if(submitted) return (<div style={S.loginBg}><style>{CSS}</style><div style={{...S.loginCard,maxWidth:"480px"}}><div style={{textAlign:"center"}}><div style={{fontSize:"34px",marginBottom:"14px"}}>✅</div><div style={{fontSize:"13px",fontWeight:700,color:"#F8FAFC",marginBottom:"8px"}}>お申し込みありがとうございます</div><div style={{fontSize:"13px",color:"#A09888",lineHeight:1.8,marginBottom:"20px"}}>内容を確認の上、ご登録のメールアドレスに<br/>ログイン情報をお送りいたします。</div><button style={S.loginBtn} onClick={onBack}>ログイン画面に戻る</button></div></div></div>);
  return (<div style={S.loginBg}><style>{CSS}</style><div style={{...S.loginCard,maxWidth:"520px"}}><div style={{textAlign:"center",marginBottom:"24px"}}><Logo size="lg" light/><div style={{fontSize:"16px",fontWeight:600,color:"#E2E8F0",marginTop:"14px",letterSpacing:"0.5px"}}>アカウント新規申し込み</div><div style={{fontSize:"10px",color:"#5A6B82",marginTop:"6px",letterSpacing:"1.5px"}}>TOKASU AI — NEW ACCOUNT</div>{refCode&&<div style={{fontSize:"13px",color:"#C4A35A",marginTop:"6px",background:"rgba(196,163,90,0.1)",padding:"3px 10px",borderRadius:"5px",display:"inline-block"}}>紹介コード: {refCode}</div>}</div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}><div style={S.inputGroup}><label style={S.labelDark}>会社名 / 団体名 *</label><input style={S.inputDark} value={form.companyName} onChange={e=>uf("companyName",e.target.value)} placeholder="株式会社サンプル"/></div><div style={S.inputGroup}><label style={S.labelDark}>担当者名 *</label><input style={S.inputDark} value={form.rep} onChange={e=>uf("rep",e.target.value)} placeholder="山田 太郎"/></div></div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}><div style={S.inputGroup}><label style={S.labelDark}>メールアドレス *</label><input style={S.inputDark} value={form.email} onChange={e=>uf("email",e.target.value)} placeholder="info@example.co.jp"/></div><div style={S.inputGroup}><label style={S.labelDark}>電話番号</label><input style={S.inputDark} value={form.phone} onChange={e=>uf("phone",e.target.value)} placeholder="03-1234-5678"/></div></div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}><div style={S.inputGroup}><label style={S.labelDark}>業種</label><input style={S.inputDark} value={form.bizType} onChange={e=>uf("bizType",e.target.value)} placeholder="飲食業 / 小売業 等"/></div><div style={S.inputGroup}><label style={S.labelDark}>従業員数</label><input style={S.inputDark} value={form.empCount} onChange={e=>uf("empCount",e.target.value)} placeholder="25"/></div></div>
    <div style={S.inputGroup}><label style={S.labelDark}>所在地</label><input style={S.inputDark} value={form.address} onChange={e=>uf("address",e.target.value)} placeholder="東京都港区○○1-2-3"/></div>
    <div style={S.inputGroup}><label style={S.labelDark}>備考・ご質問</label><textarea style={{...S.inputDark,minHeight:"60px",resize:"vertical"}} value={form.message} onChange={e=>uf("message",e.target.value)}/></div>
    <button style={S.loginBtn} onClick={handleSubmit}>申し込む</button>
    <div style={{textAlign:"center",marginTop:"12px"}}><button onClick={onBack} style={{background:"none",border:"none",color:"#8C7E6A",fontSize:"14px",cursor:"pointer",fontFamily:"'Noto Sans JP',sans-serif"}}>← ログイン画面に戻る</button></div>
  </div></div>);
}

function SidebarShell({ user, role, navItems, tab, setTab, onLogout, children }) {
  const [expanded,setExpanded]=useState({});
  useEffect(()=>{const ex={};navItems.forEach(item=>{if(item.children&&item.children.some(c=>c.id===tab))ex[item.id]=true;});setExpanded(p=>({...p,...ex}));},[tab]);
  const toggle=(id)=>setExpanded(p=>({...p,[id]:!p[id]}));
  const topItems=navItems.filter(i=>!i.bottom);const bottomItems=navItems.filter(i=>i.bottom);
  const renderItem=(item)=>{
    if(item.children){const isActive=item.children.some(c=>c.id===tab);const isOpen=expanded[item.id];
      return(<div key={item.id}><button style={{...S.navItem,...(isActive?{background:"rgba(245,230,200,0.08)",color:"#D4C4A8"}:{}),display:"flex",justifyContent:"space-between",alignItems:"center"}} onClick={()=>toggle(item.id)}><span>{item.label}</span><span style={{fontSize:"13px",transition:"transform 0.2s",transform:isOpen?"rotate(90deg)":"rotate(0deg)",opacity:0.4}}>▶</span></button>
        {isOpen&&<div>{item.children.map(c=>(<button key={c.id} style={{...S.navItem,paddingLeft:"28px",fontSize:"13px",...(tab===c.id?S.navItemActive:{})}} onClick={()=>setTab(c.id)}>{c.label}</button>))}</div>}</div>);}
    return(<button key={item.id} style={{...S.navItem,...(tab===item.id?S.navItemActive:{})}} onClick={()=>setTab(item.id)}>{item.label}</button>);
  };
  return (
    <div style={S.dashLayout}><style>{CSS}</style>
      <div style={S.sidebar}>
        <div style={S.sidebarHeader}><div><Logo size="sm" light/><div style={{fontSize:"9px",color:"#5A6B82",letterSpacing:"0.8px",marginTop:"2px"}}>{role==="admin"?"管理コンソール":"申請サポート"}</div></div></div>
        <nav style={S.sidebarNav}>{topItems.map(renderItem)}</nav>
        {bottomItems.length>0&&<div style={{padding:"4px 10px",borderTop:"1px solid rgba(255,255,255,0.05)"}}>{bottomItems.map(renderItem)}</div>}
        <div style={S.sidebarFooter}>
          {user.lastLogin&&<div style={{fontSize:"13px",color:"#5A4F42",padding:"0 12px 6px",borderBottom:"1px solid #1E293B",marginBottom:"8px"}}>前回ログイン: {new Date(user.lastLogin).toLocaleString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}</div>}
          <div style={S.userInfo}><div style={S.userAvatar}>{user.name?.[0]||"U"}</div><div><div style={{fontSize:"13px",fontWeight:600,color:"#F8FAFC"}}>{user.name}</div><div style={{fontSize:"12px",color:"#8C7E6A"}}>{role==="admin"?"管理者":user.department||"ユーザー"}</div></div></div>
          <button style={S.logoutBtn} onClick={onLogout}>ログアウト</button>
        </div>
      </div>
      <div style={S.mainContent}>{children}</div>
    </div>
  );
}

function AdminDashboard({ user, onLogout }) {
  const [tab, setTab] = useState("home");
  const [users, setUsers] = useState([]); const [incidents, setIncidents] = useState([]); const [aiUsage, setAiUsage] = useState({});
  const loadData = useCallback(async () => { setUsers(await Storage.get("user_accounts")||[]); setIncidents(await Storage.get("incidents")||[]); setAiUsage(await Storage.get("ai_usage")||{}); }, []);
  useEffect(() => { loadData(); }, [loadData]);
  const navItems = [{id:"home",label:"ダッシュボード"},{id:"users",label:"アカウント管理"},{id:"applications",label:"申込管理"},{id:"announcements",label:"お知らせ管理"},{id:"incidents",label:"インシデント"},{id:"reports",label:"レポート"},{id:"settings",label:"設定"}];
  return (
    <SidebarShell user={user} role="admin" navItems={navItems} tab={tab} setTab={setTab} onLogout={onLogout}>
      {tab==="home"&&<AdminHome users={users} incidents={incidents} aiUsage={aiUsage}/>}
      {tab==="users"&&<AdminUsers users={users} onRefresh={loadData}/>}
      {tab==="applications"&&<AdminApplications/>}
      {tab==="announcements"&&<AdminAnnouncements/>}
      {tab==="incidents"&&<AdminIncidents incidents={incidents}/>}
      {tab==="reports"&&<AdminReports incidents={incidents} users={users}/>}
      {tab==="settings"&&<AdminSettings/>}
    </SidebarShell>
  );
}

function AdminHome({ users, incidents, aiUsage }) {
  const todayInc=incidents.filter(i=>new Date(i.date).toDateString()===new Date().toDateString()).length;
  const highSev=incidents.filter(i=>i.severity>=60).length;
  const expiring=users.filter(u=>{const i=getMembershipInfo(u);return i.status==="expiring"||i.status==="expired";}).length;
  const stats=[{label:"登録ユーザー",value:users.length,sub:`${users.filter(u=>u.active).length}名アクティブ`},{label:"インシデント",value:incidents.length,sub:`本日 ${todayInc}件`},{label:"高リスク",value:highSev,sub:"深刻度60%以上"},{label:"契約注意",value:expiring,sub:expiring>0?"要確認":"問題なし"}];
  return (
    <div style={{padding:"32px",animation:"fadeIn 0.3s ease"}}><h2 style={S.pageTitle}>ダッシュボード</h2>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"14px",marginTop:"20px"}}>{stats.map((s,i)=>(<div key={i} style={S.statCard}><div style={{fontSize:"13px",color:"#8C7E6A",fontWeight:500}}>{s.label}</div><div style={{fontSize:"18px",fontWeight:700,color:"#2C2418",fontFamily:"'Inter',sans-serif",marginTop:"4px"}}>{s.value}</div><div style={{fontSize:"13px",color:"#A09888",marginTop:"2px"}}>{s.sub}</div></div>))}</div>
      <h3 style={{...S.sectionTitle,marginTop:"28px"}}>最近のインシデント</h3>
      <div style={S.tableWrap}>{incidents.length===0?<div style={S.emptyState}>記録なし</div>:(<table style={S.table}><thead><tr><th style={S.th}>日時</th><th style={S.th}>報告者</th><th style={S.th}>類型</th><th style={S.th}>深刻度</th><th style={S.th}>AI</th></tr></thead><tbody>{incidents.slice(-10).reverse().map((inc,i)=>{const sev=getSeverityColor(inc.severity);return(<tr key={i} style={S.tr}><td style={S.td}>{new Date(inc.date).toLocaleString("ja-JP")}</td><td style={S.td}>{inc.reporter}</td><td style={S.td}>{inc.type}</td><td style={S.td}><span style={{...S.badge,background:sev.bg,color:sev.text}}>{inc.severity}%</span></td><td style={S.td}>{inc.aiJudgment?"済":"—"}</td></tr>);})}</tbody></table>)}</div>
    </div>
  );
}

function AdminUsers({ users, onRefresh }) {
  const [showForm,setShowForm]=useState(false);const [editingUser,setEditingUser]=useState(null);
  const [expandedMemo,setExpandedMemo]=useState(null);const [newMemo,setNewMemo]=useState({date:new Date().toISOString().slice(0,10),text:""});
  const [form,setForm]=useState({name:"",userId:"",password:"",department:"",membershipType:"app_7m",enrollmentDate:new Date().toISOString().slice(0,10),baseMemo:""});
  const genPw=()=>{const c="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";let p="";for(let i=0;i<10;i++)p+=c[Math.floor(Math.random()*c.length)];setForm(f=>({...f,password:p}));};
  const resetForm=()=>{setForm({name:"",userId:"",password:"",department:"",membershipType:"app_7m",enrollmentDate:new Date().toISOString().slice(0,10),baseMemo:""});setEditingUser(null);};
  const createUser=async()=>{if(!form.name||!form.userId||!form.password){alert("氏名、ID、パスワードは必須");return;}const e=await Storage.get("user_accounts")||[];if(!editingUser&&e.find(u=>u.userId===form.userId)){alert("ID重複");return;}if(editingUser){await Storage.set("user_accounts",e.map(u=>u.userId===editingUser?{...u,name:form.name,department:form.department,password:form.password,membershipType:form.membershipType,enrollmentDate:form.enrollmentDate,baseMemo:form.baseMemo}:u));}else{await Storage.set("user_accounts",[...e,{...form,active:true,createdAt:new Date().toISOString(),role:"user"}]);}resetForm();setShowForm(false);onRefresh();};
  const startEdit=(u)=>{setForm({name:u.name,userId:u.userId,password:u.password,department:u.department||"",membershipType:u.membershipType||"support",enrollmentDate:u.enrollmentDate||new Date().toISOString().slice(0,10),baseMemo:u.baseMemo||""});setEditingUser(u.userId);setShowForm(true);};
  const toggleUser=async(id)=>{const e=await Storage.get("user_accounts")||[];await Storage.set("user_accounts",e.map(u=>u.userId===id?{...u,active:!u.active}:u));onRefresh();};
  const toMonthly=async(id)=>{if(!confirm("月額会員に移行しますか？"))return;const e=await Storage.get("user_accounts")||[];await Storage.set("user_accounts",e.map(u=>u.userId===id?{...u,membershipType:"app_monthly",monthlyStartDate:new Date().toISOString()}:u));onRefresh();};
  const deleteUser=async(id)=>{if(!confirm("削除しますか？"))return;const e=await Storage.get("user_accounts")||[];await Storage.set("user_accounts",e.filter(u=>u.userId!==id));onRefresh();};
  const toggleMemo=(id)=>{setExpandedMemo(p=>p===id?null:id);setNewMemo({date:new Date().toISOString().slice(0,10),text:""});};
  const addMemo=async(id)=>{if(!newMemo.text.trim())return;const e=await Storage.get("user_accounts")||[];await Storage.set("user_accounts",e.map(u=>u.userId!==id?u:{...u,memos:[...(u.memos||[]),{id:Date.now().toString(),date:newMemo.date,text:newMemo.text.trim(),createdAt:new Date().toISOString()}]}));setNewMemo({date:new Date().toISOString().slice(0,10),text:""});onRefresh();};
  const deleteMemo=async(uid,mid)=>{const e=await Storage.get("user_accounts")||[];await Storage.set("user_accounts",e.map(u=>u.userId!==uid?u:{...u,memos:(u.memos||[]).filter(m=>m.id!==mid)}));onRefresh();};

  const selType=MEMBERSHIP_TYPES.find(t=>t.id===form.membershipType);
  let calcEnd=null;if(selType?.duration&&form.enrollmentDate){const d=new Date(form.enrollmentDate);d.setMonth(d.getMonth()+selType.duration);calcEnd=d.toLocaleDateString("ja-JP");}
  const counts={support:0,app_7m:0,app_1y:0,app_monthly:0,expiring:0,expired:0};users.forEach(u=>{counts[u.membershipType||"support"]=(counts[u.membershipType||"support"]||0)+1;const i=getMembershipInfo(u);if(i.status==="expiring")counts.expiring++;if(i.status==="expired")counts.expired++;});

  return (
    <div style={{padding:"32px",animation:"fadeIn 0.3s ease"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"20px"}}><h2 style={S.pageTitle}>アカウント・会員管理</h2><button style={S.primaryBtn} onClick={()=>{resetForm();genPw();setShowForm(!showForm);}}>+ 新規アカウント発行</button></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:"8px",marginBottom:"18px"}}>{[{l:"サポート",v:counts.support,c:"#64748B"},{l:"7か月",v:counts.app_7m,c:"#1D4ED8"},{l:"1年",v:counts.app_1y,c:"#6D28D9"},{l:"月額",v:counts.app_monthly,c:"#047857"},{l:"期限間近",v:counts.expiring,c:"#B45309"},{l:"期限切れ",v:counts.expired,c:"#B91C1C"}].map((s,i)=>(<div key={i} style={{background:"#FFF",borderRadius:"6px",padding:"10px",border:"1px solid #E0D9CE",textAlign:"center"}}><div style={{fontSize:"12px",color:"#8C7E6A"}}>{s.l}</div><div style={{fontSize:"13px",fontWeight:800,color:s.c,fontFamily:"'Inter',sans-serif"}}>{s.v}</div></div>))}</div>

      {showForm&&(<div style={S.formCard}>
        <div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"14px",borderBottom:"1px solid #E8ECF0",paddingBottom:"8px"}}>{editingUser?"会員情報の編集":"新規ユーザー登録"}</div>
        <div style={S.formGrid}><div style={S.inputGroup}><label style={S.label}>氏名 *</label><input style={S.input} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="山田 太郎"/></div><div style={S.inputGroup}><label style={S.label}>部署/会社名</label><input style={S.input} value={form.department} onChange={e=>setForm(f=>({...f,department:e.target.value}))} placeholder="営業部"/></div></div>
        <div style={S.formGrid}><div style={S.inputGroup}><label style={S.label}>ユーザーID *</label><input style={S.input} value={form.userId} disabled={!!editingUser} onChange={e=>setForm(f=>({...f,userId:e.target.value}))} placeholder="yamada.taro"/></div><div style={S.inputGroup}><label style={S.label}>パスワード *</label><div style={{display:"flex",gap:"8px"}}><input style={{...S.input,flex:1,fontFamily:"monospace"}} value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))}/><button style={S.secondaryBtn} onClick={genPw}>自動生成</button></div></div></div>
        <div style={{background:"#FAF7F2",borderRadius:"6px",padding:"14px",border:"1px solid #E0D9CE",margin:"10px 0"}}>
          <div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"10px"}}>会員種別・契約情報</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"10px"}}><div style={S.inputGroup}><label style={S.label}>会員種別 *</label><select style={S.select} value={form.membershipType} onChange={e=>setForm(f=>({...f,membershipType:e.target.value}))}>{MEMBERSHIP_TYPES.map(t=><option key={t.id} value={t.id}>{t.label}（{t.desc}）</option>)}</select></div><div style={S.inputGroup}><label style={S.label}>入会日 *</label><input style={S.input} type="date" value={form.enrollmentDate} onChange={e=>setForm(f=>({...f,enrollmentDate:e.target.value}))}/></div><div style={S.inputGroup}><label style={S.label}>契約終了日（自動）</label><div style={{padding:"9px 12px",fontSize:"13px",borderRadius:"6px",background:"#FFF",border:"1px solid #E0D9CE",color:calcEnd?"#0F172A":"#94A3B8",fontWeight:calcEnd?600:400}}>{calcEnd||(form.membershipType==="support"?"期限なし":"月額継続")}</div></div></div>
          {(form.membershipType==="app_7m"||form.membershipType==="app_1y")&&<div style={{marginTop:"6px",padding:"7px 10px",borderRadius:"4px",background:"#FEF3C7",border:"1px solid #FDE68A",fontSize:"13px",color:"#92400E"}}>※ 初回契約終了後、アプリ月額会員へ自動移行（決済はBASE管理）</div>}
          <div style={{...S.inputGroup,marginTop:"8px",marginBottom:0}}><label style={S.label}>BASE決済メモ</label><input style={S.input} value={form.baseMemo} onChange={e=>setForm(f=>({...f,baseMemo:e.target.value}))} placeholder="BASE注文番号 等"/></div>
        </div>
        <div style={{display:"flex",gap:"8px"}}><button style={S.primaryBtn} onClick={createUser}>{editingUser?"更新":"登録"}</button><button style={S.ghostBtn} onClick={()=>{setShowForm(false);resetForm();}}>キャンセル</button></div>
      </div>)}

      <div style={S.tableWrap}>{users.length===0?<div style={S.emptyState}>ユーザー未登録</div>:(<table style={S.table}><thead><tr><th style={S.th}>氏名</th><th style={S.th}>ID / PW</th><th style={S.th}>部署</th><th style={S.th}>会員種別</th><th style={S.th}>入会日</th><th style={S.th}>終了日</th><th style={S.th}>残日数</th><th style={S.th}>状態</th><th style={S.th}>操作</th></tr></thead><tbody>
        {users.map((u,i)=>{const mi=getMembershipInfo(u);const ms=STATUS_MAP[mi.status];const mt=MEMBERSHIP_TYPES.find(t=>t.id===u.membershipType)||MEMBERSHIP_TYPES[0];const mc=(u.memos||[]).length;const isO=expandedMemo===u.userId;
        return(<React.Fragment key={i}><tr style={{...S.tr,background:mi.status==="expired"?"#FEF2F2":mi.status==="expiring"?"#FFFBEB":"transparent"}}>
          <td style={{...S.td,fontWeight:600}}>{u.name}</td>
          <td style={S.td}><div style={{fontFamily:"monospace",fontSize:"13px",lineHeight:1.5}}><div>{u.userId}</div><div style={{color:"#A09888"}}>{u.password}</div></div></td>
          <td style={S.td}>{u.department||"—"}</td>
          <td style={S.td}><span style={{...S.badge,background:mt.bg,color:mt.color,fontSize:"13px"}}>{mt.label}</span></td>
          <td style={{...S.td,fontSize:"13px"}}>{u.enrollmentDate?new Date(u.enrollmentDate).toLocaleDateString("ja-JP"):"—"}</td>
          <td style={{...S.td,fontSize:"13px"}}>{mi.expiryDate?mi.expiryDate.toLocaleDateString("ja-JP"):u.membershipType==="app_monthly"?"月額継続":"—"}</td>
          <td style={S.td}>{mi.daysLeft!==null?<span style={{fontWeight:700,fontSize:"13px",fontFamily:"'Inter'",color:mi.daysLeft<=0?"#B91C1C":mi.daysLeft<=30?"#B45309":"#15803D"}}>{mi.daysLeft<=0?"期限切れ":`${mi.daysLeft}日`}</span>:"—"}</td>
          <td style={S.td}><span style={{...S.badge,background:ms.bg,color:ms.color,fontSize:"13px"}}>{ms.label}</span></td>
          <td style={S.td}><div style={{display:"flex",gap:"3px",flexWrap:"wrap"}}>
            <button style={{...S.tinyBtn,background:isO?"#EFF6FF":"#F8FAFC",color:isO?"#1D4ED8":"#475569",position:"relative"}} onClick={()=>toggleMemo(u.userId)}>メモ{mc>0&&<span style={{position:"absolute",top:"-4px",right:"-4px",background:"#1D4ED8",color:"#FFF",fontSize:"9px",fontWeight:700,width:"14px",height:"14px",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center"}}>{mc}</span>}</button>
            <button style={S.tinyBtn} onClick={()=>startEdit(u)}>編集</button>
            <button style={S.tinyBtn} onClick={()=>toggleUser(u.userId)}>{u.active?"無効化":"有効化"}</button>
            {mi.status==="expired"&&u.membershipType!=="app_monthly"&&<button style={{...S.tinyBtn,color:"#047857"}} onClick={()=>toMonthly(u.userId)}>月額移行</button>}
            <button style={{...S.tinyBtn,color:"#B91C1C"}} onClick={()=>deleteUser(u.userId)}>削除</button>
          </div></td>
        </tr>
        {isO&&<tr><td colSpan={9} style={{padding:0,background:"#FAF7F2",borderBottom:"2px solid #BFDBFE"}}><div style={{padding:"14px 18px"}}>
          <div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"10px"}}>{u.name} — 顧客メモ（{mc}件）</div>
          <div style={{display:"flex",gap:"8px",alignItems:"flex-end",padding:"10px",background:"#FFF",borderRadius:"6px",border:"1px solid #E0D9CE",marginBottom:"8px"}}>
            <div style={{width:"130px"}}><div style={{fontSize:"13px",fontWeight:600,color:"#8C7E6A",marginBottom:"3px"}}>日付</div><input type="date" style={{...S.input,padding:"6px 8px",fontSize:"13px"}} value={newMemo.date} onChange={e=>setNewMemo(m=>({...m,date:e.target.value}))}/></div>
            <div style={{flex:1}}><div style={{fontSize:"13px",fontWeight:600,color:"#8C7E6A",marginBottom:"3px"}}>内容</div><input style={{...S.input,padding:"6px 8px",fontSize:"13px"}} value={newMemo.text} onChange={e=>setNewMemo(m=>({...m,text:e.target.value}))} placeholder="対応内容、連絡事項など" onKeyDown={e=>e.key==="Enter"&&addMemo(u.userId)}/></div>
            <button style={{...S.primaryBtn,padding:"6px 12px",fontSize:"13px"}} onClick={()=>addMemo(u.userId)}>追加</button>
          </div>
          {(u.memos||[]).length===0?<div style={{textAlign:"center",padding:"12px",color:"#A09888",fontSize:"13px"}}>メモなし</div>:(<div style={{maxHeight:"180px",overflowY:"auto"}}>{[...(u.memos||[])].reverse().map(m=>(<div key={m.id} style={{display:"flex",gap:"8px",alignItems:"flex-start",padding:"7px 10px",background:"#FFF",borderRadius:"4px",border:"1px solid #F1F5F9",marginBottom:"3px"}}><div style={{fontSize:"13px",color:"#8B6914",fontWeight:600,background:"#EFF6FF",padding:"2px 6px",borderRadius:"3px",whiteSpace:"nowrap",flexShrink:0}}>{new Date(m.date).toLocaleDateString("ja-JP")}</div><div style={{flex:1,fontSize:"13px",color:"#3D3629",lineHeight:1.5}}>{m.text}</div><button style={{background:"none",border:"none",color:"#D4C4A8",cursor:"pointer",fontSize:"13px"}} onClick={()=>deleteMemo(u.userId,m.id)} onMouseEnter={e=>e.target.style.color="#B91C1C"} onMouseLeave={e=>e.target.style.color="#CBD5E1"}>削除</button></div>))}</div>)}
        </div></td></tr>}
        </React.Fragment>);})}
      </tbody></table>)}</div>
      <div style={{marginTop:"10px",padding:"8px 14px",background:"#FFF",borderRadius:"6px",border:"1px solid #E0D9CE",display:"flex",gap:"16px",fontSize:"13px",color:"#5A4F42",flexWrap:"wrap"}}><span style={{fontWeight:600,color:"#2C2418"}}>凡例:</span>{MEMBERSHIP_TYPES.map(t=><span key={t.id} style={{display:"flex",alignItems:"center",gap:"3px"}}><span style={{width:"7px",height:"7px",borderRadius:"2px",background:t.color,display:"inline-block"}}/>{t.label}</span>)}<span style={{marginLeft:"auto",color:"#A09888"}}>決済:BASE管理 / 初回契約後→月額自動移行</span></div>
    </div>
  );
}

function AdminIncidents({ incidents }) {
  return (<div style={{padding:"32px",animation:"fadeIn 0.3s ease"}}><h2 style={S.pageTitle}>インシデント一覧</h2><div style={S.tableWrap}>{incidents.length===0?<div style={S.emptyState}>記録なし</div>:(<table style={S.table}><thead><tr><th style={S.th}>日時</th><th style={S.th}>報告者</th><th style={S.th}>類型</th><th style={S.th}>深刻度</th><th style={S.th}>要約</th><th style={S.th}>AI</th></tr></thead><tbody>{[...incidents].reverse().map((inc,i)=>{const sev=getSeverityColor(inc.severity);return(<tr key={i} style={S.tr}><td style={S.td}>{new Date(inc.date).toLocaleString("ja-JP")}</td><td style={S.td}>{inc.reporter}</td><td style={S.td}>{inc.type}</td><td style={S.td}><span style={{...S.badge,background:sev.bg,color:sev.text}}>{inc.severity}%</span></td><td style={{...S.td,maxWidth:"280px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{inc.summary||inc.description?.substring(0,50)}</td><td style={S.td}>{inc.aiJudgment?"済":"—"}</td></tr>);})}</tbody></table>)}</div></div>);
}

function AdminReports({ incidents, users }) {
  const byType={};incidents.forEach(i=>{byType[i.type]=(byType[i.type]||0)+1;});const maxT=Math.max(...Object.values(byType),1);
  return (<div style={{padding:"32px",animation:"fadeIn 0.3s ease"}}><h2 style={S.pageTitle}>レポート</h2>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"16px",marginTop:"20px"}}>
      <div style={S.card}><h3 style={S.sectionTitle}>行為類型別</h3>{Object.entries(byType).sort((a,b)=>b[1]-a[1]).map(([t,c],i)=>(<div key={i} style={{marginBottom:"8px"}}><div style={{display:"flex",justifyContent:"space-between",fontSize:"13px",marginBottom:"2px"}}><span style={{color:"#5A4F42"}}>{t}</span><span style={{fontWeight:600}}>{c}件</span></div><div style={{height:"5px",background:"#F3F5F8",borderRadius:"3px"}}><div style={{height:"100%",width:`${(c/maxT)*100}%`,background:"#1D4ED8",borderRadius:"3px"}}/></div></div>))}{Object.keys(byType).length===0&&<div style={S.emptyState}>データなし</div>}</div>
      <div style={S.card}><h3 style={S.sectionTitle}>奨励金申請サマリー</h3><div style={{fontSize:"13px",lineHeight:2,color:"#5A4F42"}}><p>ユーザー: {users.length}名 / AI判定: {incidents.filter(i=>i.aiJudgment).length}件 / インシデント: {incidents.length}件 / 高リスク: {incidents.filter(i=>i.severity>=60).length}件</p><p style={{color:"#8B6914",fontWeight:500,marginTop:"4px"}}>東京都カスハラ防止条例準拠AIシステム</p></div></div>
    </div>
  </div>);
}

function AdminApplications() {
  const [apps,setApps]=useState([]);const [refs,setRefs]=useState([]);
  useEffect(()=>{(async()=>{setApps(await Storage.get("signup_applications")||[]);setRefs(await Storage.get("affiliate_referrals")||[]);})();},[]);
  const updateStatus=async(idx,status)=>{const a=[...apps];a[idx].status=status;setApps(a);await Storage.set("signup_applications",a);
    if(status==="approved"&&a[idx].refCode){const r=await Storage.get("affiliate_referrals")||[];const ri=r.findIndex(x=>x.appEmail===a[idx].email&&x.status==="pending");if(ri>=0){r[ri].status="confirmed";await Storage.set("affiliate_referrals",r);setRefs(r);}}};
  const ST={pending:{bg:"#FEF3C7",color:"#92400E",label:"審査中"},approved:{bg:"#DCFCE7",color:"#15803D",label:"承認済"},rejected:{bg:"#FEE2E2",color:"#B91C1C",label:"却下"}};
  return (<div style={{padding:"32px",animation:"fadeIn 0.3s ease"}}><h2 style={S.pageTitle}>申込管理</h2>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"12px",marginBottom:"16px"}}>
      <div style={S.statCard}><div style={{fontSize:"12px",color:"#8C7E6A"}}>総申込数</div><div style={{fontSize:"18px",fontWeight:700,color:"#2C2418",fontFamily:"'Inter',sans-serif"}}>{apps.length}</div></div>
      <div style={S.statCard}><div style={{fontSize:"12px",color:"#8C7E6A"}}>審査中</div><div style={{fontSize:"18px",fontWeight:800,color:"#B45309",fontFamily:"'Inter',sans-serif"}}>{apps.filter(a=>a.status==="pending").length}</div></div>
      <div style={S.statCard}><div style={{fontSize:"12px",color:"#8C7E6A"}}>紹介経由</div><div style={{fontSize:"18px",fontWeight:800,color:"#6D28D9",fontFamily:"'Inter',sans-serif"}}>{apps.filter(a=>a.refCode).length}</div></div>
    </div>
    {apps.length===0?<div style={{...S.card,...S.emptyState}}>申込はまだありません</div>:[...apps].reverse().map((a,i)=>{const idx=apps.length-1-i;const st=ST[a.status]||ST.pending;return(<div key={i} style={{...S.card,marginBottom:"8px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div><div style={{fontSize:"16px",fontWeight:600,color:"#2C2418"}}>{a.companyName}</div><div style={{fontSize:"13px",color:"#8C7E6A",marginTop:"2px"}}>{a.rep} / {a.email} / {a.phone||"TEL未入力"}</div><div style={{fontSize:"13px",color:"#A09888",marginTop:"2px"}}>{a.bizType} / {a.empCount}名 / {a.address}</div>{a.refCode&&<div style={{fontSize:"13px",color:"#6D28D9",marginTop:"3px"}}>紹介コード: {a.refCode}</div>}{a.message&&<div style={{fontSize:"13px",color:"#5A4F42",marginTop:"4px",background:"#FAF7F2",padding:"4px 8px",borderRadius:"3px"}}>{a.message}</div>}</div>
        <div style={{textAlign:"right",flexShrink:0,marginLeft:"12px"}}><span style={{...S.badge,background:st.bg,color:st.color,fontSize:"13px"}}>{st.label}</span><div style={{fontSize:"13px",color:"#A09888",marginTop:"4px"}}>{new Date(a.date).toLocaleDateString("ja-JP")}</div>
          {a.status==="pending"&&<div style={{display:"flex",gap:"4px",marginTop:"6px"}}><button style={{...S.primaryBtn,padding:"3px 10px",fontSize:"13px"}} onClick={()=>updateStatus(idx,"approved")}>承認</button><button style={{...S.ghostBtn,padding:"3px 10px",fontSize:"13px",color:"#B91C1C"}} onClick={()=>updateStatus(idx,"rejected")}>却下</button></div>}
        </div>
      </div>
    </div>);})}
  </div>);
}

function AdminAnnouncements() {
  const [items,setItems]=useState([]);const [form,setForm]=useState({title:"",body:"",type:"info"});const [editing,setEditing]=useState(null);
  useEffect(()=>{(async()=>{setItems(await Storage.get("announcements")||[]);})();},[]);
  const save=async()=>{if(!form.title){alert("タイトルを入力してください");return;}const a=[...items];
    if(editing!==null){a[editing]={...a[editing],...form,updatedAt:new Date().toISOString()};}
    else{a.unshift({...form,id:`ANN${Date.now()}`,date:new Date().toISOString()});}
    setItems(a);await Storage.set("announcements",a);setForm({title:"",body:"",type:"info"});setEditing(null);};
  const del=async(idx)=>{const a=items.filter((_,i)=>i!==idx);setItems(a);await Storage.set("announcements",a);};
  const TYPES={info:{bg:"#DBEAFE",color:"#8B6914",label:"お知らせ"},important:{bg:"#FEF3C7",color:"#92400E",label:"重要"},urgent:{bg:"#FEE2E2",color:"#B91C1C",label:"緊急"},update:{bg:"#DCFCE7",color:"#15803D",label:"アップデート"}};
  return (<div style={{padding:"32px",animation:"fadeIn 0.3s ease"}}><h2 style={S.pageTitle}>お知らせ管理</h2>
    <div style={S.card}>
      <div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"10px"}}>{editing!==null?"お知らせを編集":"新規お知らせ作成"}</div>
      <div style={S.formGrid}><div style={S.inputGroup}><label style={S.label}>タイトル *</label><input style={S.input} value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="お知らせタイトル"/></div>
        <div style={S.inputGroup}><label style={S.label}>種類</label><select style={S.select} value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}><option value="info">お知らせ</option><option value="important">重要</option><option value="urgent">緊急</option><option value="update">アップデート</option></select></div></div>
      <div style={S.inputGroup}><label style={S.label}>本文</label><textarea style={S.textarea} value={form.body} onChange={e=>setForm(f=>({...f,body:e.target.value}))} rows={3} placeholder="お知らせ内容を入力"/></div>
      <div style={{display:"flex",gap:"8px"}}><button style={S.primaryBtn} onClick={save}>{editing!==null?"更新":"公開"}</button>{editing!==null&&<button style={S.ghostBtn} onClick={()=>{setEditing(null);setForm({title:"",body:"",type:"info"});}}>キャンセル</button>}</div>
    </div>
    <div style={{marginTop:"16px"}}>{items.length===0?<div style={{...S.card,...S.emptyState}}>お知らせはまだありません</div>:items.map((a,i)=>{const t=TYPES[a.type]||TYPES.info;return(<div key={i} style={{...S.card,marginBottom:"8px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><div><div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"4px"}}><span style={{...S.badge,background:t.bg,color:t.color,fontSize:"13px"}}>{t.label}</span><span style={{fontSize:"14px",fontWeight:600,color:"#2C2418"}}>{a.title}</span></div>{a.body&&<div style={{fontSize:"13px",color:"#5A4F42",lineHeight:1.7,whiteSpace:"pre-wrap"}}>{a.body}</div>}<div style={{fontSize:"13px",color:"#A09888",marginTop:"4px"}}>{new Date(a.date).toLocaleString("ja-JP")}</div></div>
        <div style={{display:"flex",gap:"4px",flexShrink:0,marginLeft:"10px"}}><button style={{...S.secondaryBtn,padding:"3px 8px",fontSize:"13px"}} onClick={()=>{setForm({title:a.title,body:a.body,type:a.type});setEditing(i);}}>編集</button><button style={{...S.ghostBtn,padding:"3px 8px",fontSize:"13px",color:"#B91C1C"}} onClick={()=>del(i)}>削除</button></div></div>
    </div>);})}</div>
  </div>);
}

function AdminSettings() {
  const [pw,setPw]=useState("");const [saved,setSaved]=useState(false);
  const [lpEnabled,setLpEnabled]=useState(false);const [lpLoaded,setLpLoaded]=useState(false);
  useEffect(()=>{(async()=>{const v=await Storage.get("option_lp");setLpEnabled(!!v);setLpLoaded(true);})();},[]);
  const toggleLp=async()=>{const nv=!lpEnabled;setLpEnabled(nv);await Storage.set("option_lp",nv);};
  const update=async()=>{if(!pw||pw.length<6){alert("6文字以上");return;}const a=await Storage.get("admin_account");await Storage.set("admin_account",{...a,password:pw});setSaved(true);setTimeout(()=>setSaved(false),2000);setPw("");};
  return (<div style={{padding:"32px",animation:"fadeIn 0.3s ease"}}><h2 style={S.pageTitle}>設定</h2><div style={S.card}><h3 style={S.sectionTitle}>管理者パスワード変更</h3><div style={{display:"flex",gap:"8px",maxWidth:"360px"}}><input style={S.input} type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="新しいパスワード"/><button style={S.primaryBtn} onClick={update}>変更</button></div>{saved&&<div style={{color:"#15803D",fontSize:"13px",marginTop:"6px"}}>保存しました</div>}</div>
    <div style={{...S.card,marginTop:"16px"}}><h3 style={S.sectionTitle}>オプション機能管理</h3>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 14px",background:lpEnabled?"#F0FDF4":"#FFF7ED",border:"1px solid "+(lpEnabled?"#BBF7D0":"#FED7AA"),borderRadius:"6px"}}>
        <div><div style={{fontSize:"13px",fontWeight:600,color:"#0F172A"}}>簡易LP自動生成</div><div style={{fontSize:"13px",color:"#8C7E6A",marginTop:"2px"}}>基本方針掲載用HPを自動生成する有料オプション</div></div>
        <div style={{display:"flex",alignItems:"center",gap:"10px"}}>{lpLoaded&&<><span style={{fontSize:"13px",fontWeight:600,color:lpEnabled?"#15803D":"#B45309"}}>{lpEnabled?"有効":"無効"}</span>
          <button onClick={toggleLp} style={{width:"48px",height:"26px",borderRadius:"13px",border:"none",background:lpEnabled?"#15803D":"#D1D5DB",cursor:"pointer",position:"relative",transition:"background 0.2s"}}><div style={{width:"20px",height:"20px",borderRadius:"10px",background:"#FFF",position:"absolute",top:"3px",left:lpEnabled?"25px":"3px",transition:"left 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}/></button></>}</div>
      </div>
    </div>
    <div style={{...S.card,marginTop:"16px"}}><h3 style={S.sectionTitle}>システム情報</h3><div style={{fontSize:"14px",color:"#5A4F42",lineHeight:2}}><p>システム: トーカスAI（東京都カスハラ防止 申請サポート）</p><p>準拠: 東京都カスタマー・ハラスメント防止条例</p><p>AI: Claude API (Anthropic)</p><p>月間上限: {MONTHLY_AI_LIMIT}回/ユーザー</p></div></div></div>);
}

function UserDashboard({ user, onLogout }) {
  const [tab,setTab]=useState("top");const [incidents,setIncidents]=useState([]);
  const loadInc=useCallback(async()=>{const a=await Storage.get("incidents")||[];setIncidents(a.filter(i=>i.reporterId===user.userId));},[user.userId]);
  useEffect(()=>{loadInc();},[loadInc]);
  const navItems=[
    {id:"top",label:"TOP"},
    {id:"judge",label:"AI判定"},
    {id:"history",label:"記録一覧"},
    {id:"manual",label:"対応マニュアル"},
    {id:"guidelines",label:"ガイドライン"},
    {id:"subsidy_parent",label:"東京都カスハラ奨励金",bottom:true,children:[
      {id:"subsidy_info",label:"制度の説明"},
      {id:"docs",label:"書類作成サポート"},
      {id:"checklist",label:"申請チェック"},
      {id:"affiliate",label:"トーカスAI ご紹介制度"},
    ]},
  ];
  return (<SidebarShell user={user} role="user" navItems={navItems} tab={tab} setTab={setTab} onLogout={onLogout}>
    {tab==="top"&&<TopPage user={user} incidents={incidents} setTab={setTab}/>}{tab==="subsidy_info"&&<SubsidyInfoPage setTab={setTab}/>}{tab==="docs"&&<DocGenerator/>}{tab==="checklist"&&<ChecklistPage/>}{tab==="affiliate"&&<AffiliatePage user={user}/>}{tab==="judge"&&<AIJudgment user={user} onIncidentSaved={loadInc}/>}{tab==="history"&&<UserHistory incidents={incidents}/>}{tab==="manual"&&<ResponseManual/>}{tab==="guidelines"&&<GuidelinesPage/>}
  </SidebarShell>);
}

function DocGenerator() {
  const [step,setStep]=useState(0);
  const [info,setInfo]=useState({companyName:"",rep:"",repTitle:"代表取締役",address:"",bizType:"",empCount:"",deptName:"",deptPerson:"",deptPhone:"",deptEmail:"",extName:"",extPerson:"",extPhone:"",extEmail:"",aiName:"トーカスAI",aiVendor:"",aiPrice:"",aiDate:"",aiContract:"月額サービス契約",limitMin:"30",limitCount:"3",limitExit:"2",notifyDate:"",notifyMethod:"社内メール",hpUrl:""});
  const [uploads,setUploads]=useState({notice:null,hp:null,poster:null});
  const [preview,setPreview]=useState(null);
  const [lpUnlocked,setLpUnlocked]=useState(false);const [lpPreview,setLpPreview]=useState(false);
  useEffect(()=>{(async()=>{const v=await Storage.get("option_lp");setLpUnlocked(!!v);})();},[]);
  const u=(k,v)=>setInfo(p=>({...p,[k]:v}));
  const genLp=()=>{const I=info;const N=I.companyName||"○○株式会社";return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${N} | カスタマーハラスメントに対する基本方針</title><style>@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700;800&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Noto Sans JP',sans-serif;color:#1a1a2e;line-height:1.8;background:#fff}a{color:#1d4ed8;text-decoration:none}header{background:#0f172a;color:#f8fafc;padding:0 24px}header .inner{max-width:1000px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;height:64px}header .logo{font-size:18px;font-weight:700;letter-spacing:0.5px}header nav{display:flex;gap:24px;font-size:14px}header nav a{color:#94a3b8;transition:color 0.2s}header nav a:hover{color:#f8fafc}.hero{background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 50%,#1d4ed8 100%);color:#fff;padding:80px 24px;text-align:center}.hero h1{font-size:clamp(24px,4vw,36px);font-weight:800;margin-bottom:12px;line-height:1.4}.hero p{font-size:clamp(14px,2vw,16px);color:#cbd5e1;max-width:600px;margin:0 auto}section{padding:60px 24px}section .inner{max-width:800px;margin:0 auto}.section-title{font-size:clamp(20px,3vw,26px);font-weight:800;color:#0f172a;text-align:center;margin-bottom:8px}.section-sub{font-size:14px;color:#64748b;text-align:center;margin-bottom:36px}.about{background:#f8fafc}.about-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:600px){.about-grid{grid-template-columns:1fr}}.about-item{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:20px}.about-item .label{font-size:12px;color:#64748b;font-weight:500;margin-bottom:4px}.about-item .value{font-size:15px;font-weight:600;color:#0f172a}.policy-section{background:#fff}.policy-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:32px;margin-bottom:24px}.policy-box p{font-size:14px;color:#475569;margin-bottom:16px}.policy-list{counter-reset:policy}.policy-list li{list-style:none;counter-increment:policy;padding:16px 16px 16px 56px;position:relative;border-bottom:1px solid #f1f5f9;font-size:14px;color:#334155;line-height:1.7}.policy-list li:last-child{border-bottom:none}.policy-list li::before{content:counter(policy);position:absolute;left:12px;top:14px;width:32px;height:32px;background:#0f172a;color:#fff;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px}.types{background:#f8fafc}.types-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}.type-card{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:16px;font-size:13px;color:#334155;border-left:4px solid #1d4ed8}.type-card.danger{border-left-color:#b91c1c}.type-card .tname{font-weight:700;margin-bottom:4px;font-size:14px}.contact-section{background:#fff}.contact-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:600px){.contact-grid{grid-template-columns:1fr}}.contact-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:24px;text-align:center}.contact-card .ctitle{font-size:13px;color:#64748b;margin-bottom:8px}.contact-card .cname{font-size:16px;font-weight:700;color:#0f172a;margin-bottom:4px}.contact-card .cdetail{font-size:13px;color:#475569}footer{background:#0f172a;color:#94a3b8;padding:32px 24px;text-align:center;font-size:12px;line-height:1.8}footer .fname{color:#f8fafc;font-weight:700;font-size:14px;margin-bottom:4px}.emergency{background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:20px;text-align:center;margin-top:24px}.emergency .elabel{font-size:13px;color:#991b1b;font-weight:700;margin-bottom:8px}.emergency .enums{font-size:20px;font-weight:800;color:#b91c1c}</style></head><body><header><div class="inner"><div class="logo">${N}</div><nav><a href="#about">会社概要</a><a href="#policy">基本方針</a><a href="#types">カスハラとは</a><a href="#contact">お問い合わせ</a></nav></div></header><div class="hero"><h1>カスタマーハラスメントに対する<br/>基本方針</h1><p>当社は東京都カスタマー・ハラスメント防止条例に基づき、従業員の安全と尊厳を守りながら、お客様により良いサービスを提供することを目指しています。</p></div><section class="about" id="about"><div class="inner"><div class="section-title">会社概要</div><div class="section-sub">Company Information</div><div class="about-grid"><div class="about-item"><div class="label">会社名</div><div class="value">${N}</div></div><div class="about-item"><div class="label">代表者</div><div class="value">${I.repTitle} ${I.rep||"―"}</div></div><div class="about-item"><div class="label">所在地</div><div class="value">${I.address||"―"}</div></div><div class="about-item"><div class="label">事業内容</div><div class="value">${I.bizType||"―"}</div></div></div></div></section><section class="policy-section" id="policy"><div class="inner"><div class="section-title">カスタマーハラスメントに対する基本方針</div><div class="section-sub">Basic Policy against Customer Harassment</div><div class="policy-box"><p>当社は、お客様からのご意見・ご要望に真摯に対応し、より満足度の高いサービスの提供に取り組んでいます。一方、一部のお客様の要求や言動の中には、従業員の人格を否定する暴言、脅迫、暴力など、従業員の尊厳を傷つけるものもございます。</p><p>従業員が安心して業務に取り組むことで、お客様との関係をより良いものとすることにつながると考え、東京都カスタマー・ハラスメント防止条例に基づき、以下の基本方針を定めました。</p></div><ol class="policy-list"><li>お客様のご意見・ご要望には真摯に対応いたします</li><li>カスタマーハラスメントに該当する行為に対しては、従業員を守るため毅然とした対応を行います</li><li>カスタマーハラスメントの被害を受けた従業員のケアを最優先いたします</li><li>従業員への知識・対処方法の研修を定期的に実施します</li><li>相談窓口の設置や警察・弁護士等との連携など体制を整備します</li><li>カスタマーハラスメントに該当すると判断した場合、対応を打ち切り、以降のサービスの提供をお断りする場合があります</li><li>悪質と判断した場合、警察や外部の専門家と連携の上、毅然と対応いたします</li></ol></div></section><section class="types" id="types"><div class="inner"><div class="section-title">カスタマーハラスメントとは</div><div class="section-sub">What is Customer Harassment?</div><p style="font-size:14px;color:#475569;text-align:center;margin-bottom:20px">東京都カスタマー・ハラスメント防止条例において、以下のような行為がカスタマーハラスメントに該当します。</p><div class="types-grid"><div class="type-card danger"><div class="tname">暴力行為</div>物を投げる、叩く、押す等の身体的攻撃</div><div class="type-card danger"><div class="tname">暴言・侮辱</div>人格を否定する言動、誹謗中傷</div><div class="type-card danger"><div class="tname">威嚇・脅迫</div>「SNSに晒す」「訴える」等の恐怖を与える言動</div><div class="type-card"><div class="tname">土下座の要求</div>強要罪に該当しうる不当な要求</div><div class="type-card"><div class="tname">長時間の拘束</div>同じ主張の繰り返し、堂々巡り</div><div class="type-card"><div class="tname">不当・過剰な要求</div>社会通念上相当な範囲を超える要求</div><div class="type-card"><div class="tname">SNS等への投稿</div>従業員の個人情報や動画の無断公開</div><div class="type-card"><div class="tname">セクハラ行為</div>性的言動、つきまとい行為</div></div></div></section><section class="contact-section" id="contact"><div class="inner"><div class="section-title">お問い合わせ</div><div class="section-sub">Contact</div><div class="contact-grid"><div class="contact-card"><div class="ctitle">お客様窓口</div><div class="cname">${I.deptName||"○○部"}</div><div class="cdetail">TEL: ${I.deptPhone||"―"}</div><div class="cdetail">E-mail: ${I.deptEmail||"―"}</div></div><div class="contact-card"><div class="ctitle">所在地</div><div class="cname">${N}</div><div class="cdetail">${I.address||"―"}</div></div></div><div class="emergency"><div class="elabel">緊急時の連絡先</div><div class="enums">警察: 110 ／ 警察相談: #9110</div></div></div></section><footer><div class="fname">${N}</div>${I.address||""}<br/>Copyright &copy; ${new Date().getFullYear()} ${N} All Rights Reserved.<br/><span style="font-size:11px;color:#64748b">本方針は東京都カスタマー・ハラスメント防止条例に基づき策定しています</span></footer></body></html>`;};

  const cn=info.companyName||"○○株式会社";
  const today=new Date().toLocaleDateString("ja-JP",{year:"numeric",month:"long",day:"numeric"});
  const handleFile=(key,e)=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>setUploads(p=>({...p,[key]:{name:f.name,data:r.result}}));r.readAsDataURL(f);};
  const RF=({label,children,hint})=>(<div style={{marginBottom:"10px"}}><label style={S.label}>{label}</label>{hint&&<div style={{fontSize:"13px",color:"#A09888",marginBottom:"2px"}}>{hint}</div>}{children}</div>);

  const CSS_P=`@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap');body{font-family:'Noto Sans JP',sans-serif;padding:44px 52px;font-size:13px;color:#333;line-height:1.85;max-width:780px;margin:0 auto}h1{font-size:20px;color:#0F172A;text-align:center;border-bottom:3px solid #0F172A;padding-bottom:8px;margin-bottom:16px}h2{font-size:15px;color:#0F172A;border-left:4px solid #1D4ED8;padding-left:10px;margin:22px 0 8px}h3{font-size:13px;color:#334155;margin:14px 0 5px}table{width:100%;border-collapse:collapse;margin:8px 0}th{background:#0F172A;color:#FFF;padding:5px 10px;text-align:left;font-size:12px}td{padding:5px 10px;border:1px solid #E2E8F0;font-size:12px}tr:nth-child(even) td{background:#F8FAFC}.bx{background:#F8FAFC;border:1px solid #E2E8F0;border-left:4px solid #1D4ED8;padding:10px 14px;margin:8px 0;border-radius:3px}.bxr{border-left-color:#B91C1C;background:#FEF2F2}ul{padding-left:18px}li{margin-bottom:2px}.st{display:flex;gap:9px;margin:5px 0}.sn{background:#0F172A;color:#FFF;width:25px;height:25px;border-radius:3px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0}.sc{flex:1;background:#F1F5F9;padding:7px 11px;border-radius:3px}.cv{text-align:center;page-break-after:always;padding-top:100px}.cv h1{font-size:28px;border:none}.hdr{text-align:right;font-size:11px;color:#94A3B8;margin-bottom:16px}@media print{body{padding:20px 30px}}`;

  const DOCS=[
    {id:"manual",name:"カスハラ対策マニュアル",file:"10_マニュアル"},
    {id:"manual_map",name:"マニュアル必須項目対応表",file:"12_マニュアル対応表"},
    {id:"policy",name:"基本方針",file:"13_基本方針"},
    {id:"policy_proof",name:"基本方針 社内・社外周知証明",file:"14_基本方針社内・社外周知"},
    {id:"manual_proof",name:"マニュアル社内周知証明",file:"11_マニュアル周知"},
    {id:"ai_receipt",name:"AIシステム 領収書/契約書",file:"15-1_AI領収書・契約書"},
    {id:"ai_pamph",name:"AIシステム パンフレット",file:"15-2_AIパンフ"},
    {id:"ai_proof",name:"AIシステム 社内周知証明",file:"15-3_AI社内周知"},
    {id:"ai_rule",name:"AIシステム 運用ルール",file:"15-3_AI運用ルール"},
  ];
  const fname=(d)=>`${d.file}_${cn}.pdf`;

  const gen=(id)=>{const I=info;const w=(b)=>`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${cn}</title><style>${CSS_P}</style></head><body>${b}</body></html>`;
  if(id==="manual") return w(`<div class="cv"><div style="font-size:13px;color:#B91C1C;font-weight:700;text-align:right;margin-bottom:50px">社外秘</div><h1>カスタマーハラスメント<br/>対策マニュアル</h1><p style="color:#1D4ED8;font-size:13px;margin-top:10px">東京都カスタマー・ハラスメント防止条例準拠</p><p style="color:#64748B;margin-top:6px">${today}</p><p style="font-size:18px;font-weight:700;margin-top:48px">${cn}</p></div>
<h2>1. はじめに</h2><p>近年、カスタマーハラスメント（以下「カスハラ」）が深刻な社会的課題となっています。東京都では令和6年10月に「東京都カスタマー・ハラスメント防止条例」が成立し（令和7年4月施行）、全ての事業者にカスハラ防止に向けた措置が求められています。</p><p>${cn}においては、現場の従業員任せにすることなく、統一的な対応方法を定め、組織的なカスタマーハラスメント対策に取り組みます。</p>
<h2>2. カスタマーハラスメントの定義</h2><div class="bx"><strong>「顧客等から従業員に対して行われる著しい迷惑行為であって、従業員の就業環境を害するもの」</strong></div><p>著しい迷惑行為の具体例:</p><ul><li>暴力行為（物を投げる、叩く、押す等）</li><li>暴言・侮辱・誹謗中傷</li><li>威嚇・脅迫（「SNSに晒す」「訴える」等）</li><li>人格否定・差別的発言</li><li>土下座の要求（強要罪に該当しうる）</li><li>長時間の拘束（同じ主張の繰り返し、堂々巡り）</li><li>過剰な対応の強要</li><li>不当・過剰な要求（高額な賠償金等）</li><li>SNS等への信用棄損投稿（従業員の個人情報や動画の公開）</li><li>セクハラ・SOGIハラ・つきまとい行為</li></ul>
<h2>3. 基本方針</h2><div class="bx"><strong>${cn}「カスタマーハラスメントに対する基本方針」</strong><ol><li>お客様のご意見・ご要望に真摯に対応します</li><li>カスハラ該当行為には従業員を守るため毅然と対応します</li><li>被害を受けた従業員のケアを最優先します</li><li>知識・対処方法の研修を実施します</li><li>相談窓口・警察・弁護士等との連携体制を整備します</li><li>カスハラと判断した場合、対応打ち切り・サービス提供をお断りする場合があります</li><li>悪質な場合は警察や外部専門家と連携し毅然と対応します</li></ol></div>
<h2>4. 顧客対応の基本的な心構え</h2><ul><li><strong>傾聴する</strong> — 相手の気持ちを理解し背景を推し測る</li><li><strong>誠実に対応</strong> — 表情・言葉遣いに注意。クレーマー扱いしない</li><li><strong>共感を伝える</strong> — あいづちを活用する</li><li><strong>限定的な謝罪</strong> — 責任不明の段階では対象を限定した謝罪</li><li><strong>対応者を代わる</strong> — 怒りが収まらない場合は躊躇せず交代</li></ul>
<h2>5. クレームの初期対応</h2><div class="st"><div class="sn">1</div><div class="sc"><strong>顧客に寄り添う</strong> — 正当な要求は真摯に受け止め傾聴する</div></div><div class="st"><div class="sn">2</div><div class="sc"><strong>要求内容を特定</strong> — 要求を明確にし議論を限定する</div></div><div class="st"><div class="sn">3</div><div class="sc"><strong>事実確認（5W1H）</strong> — 正確に確認。確認前は限定的謝罪</div></div><div class="st"><div class="sn">4</div><div class="sc"><strong>複数人対応</strong> — 原則複数人で。役割分担を明確に</div></div><div class="st"><div class="sn">5</div><div class="sc"><strong>場所選定</strong> — オープンスペースで。密室にしない</div></div><div class="st"><div class="sn">6</div><div class="sc"><strong>記録</strong> — 詳細に記録し会話を録音する</div></div>
<h2>6. カスタマーハラスメントの判断基準</h2><table><tr><th>判断項目</th><th>チェックポイント</th></tr><tr><td><strong>要求態様</strong></td><td>暴言・暴力・脅迫・無断撮影等の有無</td></tr><tr><td><strong>要求内容</strong></td><td>不当な金品・土下座・書面謝罪・解雇要求等の有無</td></tr><tr><td><strong>時間・回数</strong></td><td>迷惑行為が${I.limitMin}分超継続 / 退去命令${I.limitExit}回以上不服従 / 要求${I.limitCount}回以上反復 / 時間外苦情</td></tr></table>
<h2>7. カスタマーハラスメントへの対応フロー</h2><div class="st"><div class="sn">1</div><div class="sc"><strong>一次対応（現場従業員）</strong> — 行為中止を求め組織的対応に移行。速やかに監督者に報告</div></div><div class="st"><div class="sn">2</div><div class="sc"><strong>二次対応（監督者）</strong> — 対応を代わり安全確保。組織としての回答を伝達</div></div><div class="st"><div class="sn">3</div><div class="sc"><strong>警告・退去命令</strong> — ${I.limitMin}分を目安に中止要求。暴力の兆候は即退去命令</div></div><div class="st"><div class="sn">4</div><div class="sc"><strong>警察連携</strong> — 退去不服従・暴力は速やかに110番通報</div></div>
<h2>8. 行為別の具体的対応例</h2><table><tr><th>行為</th><th>対応</th></tr><tr><td>暴言</td><td>冷静に対応。繰り返す場合は打ち切り。録音・記録を残す</td></tr><tr><td>執拗な要求</td><td>対応不可を明確に。${I.limitMin}分超で警察相談を案内</td></tr><tr><td>土下座要求</td><td>「そのような対応はできません」と明確に拒否。録音記録</td></tr><tr><td>暴行</td><td>刑法208条該当。即座に警察通報。複数人で安全確保</td></tr><tr><td>高圧的言動</td><td>曖昧な発言を避け安易な妥協をしない</td></tr><tr><td>長時間拘束</td><td>${I.limitMin}分超で打ち切りを通告</td></tr><tr><td>セクハラ</td><td>不快である旨を明確に伝え、改めない場合はサービス打ち切り</td></tr></table>
<h2>9. 警察との連携</h2><div class="st"><div class="sn">1</div><div class="sc">対応の中止を伝える（監督者含め複数名で判断）</div></div><div class="st"><div class="sn">2</div><div class="sc">行為の中止を求める（2〜3度繰り返す）</div></div><div class="st"><div class="sn">3</div><div class="sc">施設管理権に基づき退去を命令する（2〜3度）</div></div><div class="st"><div class="sn">4</div><div class="sc">警察に通報する（緊急: 110番 / 相談: #9110）</div></div><div class="st"><div class="sn">5</div><div class="sc">警察官に状況説明し退去させたい旨を明確に伝える</div></div>
<h2>10. 社内体制</h2><h3>相談窓口</h3><table><tr><th>区分</th><th>連絡先</th></tr><tr><td>社内窓口</td><td>${I.deptName||"○○部"} ${I.deptPerson||"○○"}<br/>TEL: ${I.deptPhone||"--"} / E-mail: ${I.deptEmail||"--"}</td></tr><tr><td>社外窓口</td><td>${I.extName||"○○事務所"} ${I.extPerson||"○○"}<br/>TEL: ${I.extPhone||"--"} / E-mail: ${I.extEmail||"--"}</td></tr><tr><td>警察（緊急）</td><td style="color:#B91C1C;font-weight:700">110</td></tr><tr><td>警察相談</td><td style="color:#B91C1C;font-weight:700">#9110</td></tr></table>
<h3>再発防止の取組</h3><ul><li>従業員への注意喚起メッセージの発信</li><li>事例の検証・マニュアル改定・研修の見直し</li><li>プライバシーに配慮した社内情報共有</li><li>定期的な研修の実施</li><li>社内アンケート等を参考にした取組の見直し</li></ul>
<h2>11. 緊急連絡先一覧</h2><table><tr><th>連絡先</th><th>電話番号</th><th>用途</th></tr><tr><td>警察（緊急）</td><td style="color:#B91C1C;font-weight:700">110</td><td>暴力等の緊急時</td></tr><tr><td>警察相談</td><td style="color:#B91C1C;font-weight:700">#9110</td><td>緊急性のない相談</td></tr><tr><td>社内相談窓口</td><td>${I.deptPhone||"--"}</td><td>カスハラ全般の相談</td></tr><tr><td>社外窓口</td><td>${I.extPhone||"--"}</td><td>法的対応の相談</td></tr></table>
<div class="bx bxr"><strong>本マニュアルは社外秘です。</strong> 定期的に見直しを行い、最新の状態を維持してください。</div>`);

  if(id==="manual_map"){const items=[["カスタマーハラスメントの定義","第2章 定義"],["カスタマーハラスメントに対する基本方針","第3章 基本方針"],["顧客対応の基本的な心構え","第4章 心構え"],["クレームの初期対応","第5章 初期対応"],["カスタマーハラスメントの判断基準","第6章 判断基準"],["カスタマーハラスメントへの対応の流れ","第7章 対応フロー"],["行為別の具体的対応例","第8章 行為別対応例"],["警察との連携","第9章 警察との連携"],["社内体制（相談窓口の設置・再発防止の取組・研修）","第10章 社内体制"]];
  return w(`<div class="hdr">${cn}</div><h1>マニュアル必須項目対応表</h1><p style="text-align:center;margin-bottom:14px">カスタマーハラスメント対策マニュアルにおける必須項目の記載箇所を以下に示します。</p><table><tr><th style="width:55%">必須項目</th><th>マニュアル記載箇所</th></tr>${items.map(([a,b])=>`<tr><td>${a}</td><td>${b}</td></tr>`).join("")}</table><p style="margin-top:20px;font-size:12px;color:#64748B">作成日: ${today} / ${cn}</p>`);}

  if(id==="policy") return w(`<div style="text-align:center;padding-top:36px"><h1 style="font-size:22px;margin-bottom:20px">${cn}<br/>カスタマーハラスメントに対する基本方針</h1><div style="text-align:left;max-width:620px;margin:0 auto"><p>当社は、お客様からのご意見・ご要望に真摯に対応し、より満足度の高いサービスの提供に取り組んでいます。</p><p>一方、一部のお客様の要求や言動の中には、従業員の人格を否定する暴言、脅迫、暴力など、従業員の尊厳を傷つけるものもございます。</p><p>従業員が安心して業務に取り組むことで、お客様との関係をより良いものとすることにつながると考え、以下の基本方針を定めました。</p><h2 style="border:none;padding:0;margin-top:18px">基本方針</h2><div class="bx"><ol style="padding-left:18px;line-height:2.2"><li>お客様のご意見・ご要望には真摯に対応いたします</li><li>カスタマーハラスメントに該当する行為に対しては、従業員を守るため毅然とした対応を行います</li><li>カスタマーハラスメントを受けた場合、従業員のケアを最優先いたします</li><li>従業員への知識・対処方法の研修を行います</li><li>相談窓口の設置や警察・弁護士等との連携など体制を整備します</li><li>カスタマーハラスメントに該当すると判断した場合、対応を打ち切り、以降のサービスの提供をお断りする場合があります</li><li>悪質と判断した場合、警察や外部の専門家と連携の上、毅然と対応いたします</li></ol></div><p style="text-align:right;margin-top:28px">${today}</p><p style="text-align:right;font-size:15px;font-weight:700">${cn}</p><p style="text-align:right">${I.repTitle} ${I.rep||"○○ ○○"}</p></div></div>`);

  if(id==="policy_proof") return w(`<div class="hdr">${cn}</div><h1>カスタマーハラスメントに対する基本方針<br/>社内・社外周知証明書</h1>
<h2>1. 社内周知</h2><table><tr><th>周知方法</th><td>${I.notifyMethod}による全従業員への配信</td></tr><tr><th>周知日</th><td>${I.notifyDate||"令和○年○月○日"}</td></tr><tr><th>対象</th><td>${cn} 全従業員</td></tr></table><p style="margin:10px 0;font-weight:700">【添付】社内周知の証拠:</p>${uploads.notice?`<div style="border:1px solid #E2E8F0;padding:8px;text-align:center"><img src="${uploads.notice.data}" style="max-width:100%;max-height:380px"/><p style="font-size:11px;color:#64748B;margin-top:4px">${uploads.notice.name}</p></div>`:`<div class="bx bxr">※社内周知の証拠画像をSTEP5でアップロードしてください</div>`}
<h2>2. 社外周知</h2><table><tr><th>周知方法</th><td>企業HP（${I.hpUrl||"URL未設定"}）への掲載</td></tr><tr><th>掲載日</th><td>${I.notifyDate||"令和○年○月○日"}</td></tr></table><p style="margin:10px 0;font-weight:700">【添付】社外周知の証拠:</p>${uploads.hp?`<div style="border:1px solid #E2E8F0;padding:8px;text-align:center"><img src="${uploads.hp.data}" style="max-width:100%;max-height:380px"/><p style="font-size:11px;color:#64748B;margin-top:4px">${uploads.hp.name}</p></div>`:`<div class="bx bxr">※HP掲載のスクリーンショットをSTEP5でアップロードしてください</div>`}
<p style="text-align:right;margin-top:20px">${today}<br/>${cn} ${I.repTitle} ${I.rep||""}</p>`);

  if(id==="manual_proof") return w(`<div class="hdr">${cn}</div><h1>カスタマーハラスメント対策マニュアル<br/>社内周知証明書</h1>
<table><tr><th>マニュアル名</th><td>${cn} カスタマーハラスメント対策マニュアル</td></tr><tr><th>周知方法</th><td>${I.notifyMethod}による全従業員への配信</td></tr><tr><th>周知日</th><td>${I.notifyDate||"令和○年○月○日"}</td></tr><tr><th>対象</th><td>${cn} 全従業員（正社員・契約社員・派遣社員含む）</td></tr></table><p style="margin:12px 0;font-weight:700">【添付】社内周知の証拠:</p>${uploads.notice?`<div style="border:1px solid #E2E8F0;padding:8px;text-align:center"><img src="${uploads.notice.data}" style="max-width:100%;max-height:380px"/><p style="font-size:11px;color:#64748B">${uploads.notice.name}</p></div>`:`<div class="bx bxr">※社内通知メール等のスクリーンショットをSTEP5でアップロードしてください</div>`}<p style="text-align:right;margin-top:20px">${today}<br/>${cn}</p>`);

  if(id==="ai_receipt") return w(`<div class="hdr">${cn}</div><h1>AIシステム等導入<br/>領収書 兼 契約書</h1>
<div class="bx"><strong>契約種別:</strong> ${I.aiContract}</div>
<table><tr><th>契約日 / 導入日</th><td>${I.aiDate||"令和○年○月○日"}</td></tr><tr><th>システム名称</th><td>${I.aiName}</td></tr><tr><th>提供事業者</th><td>${I.aiVendor||"○○株式会社"}</td></tr><tr><th>契約金額（税込）</th><td>${I.aiPrice||"○○○,○○○"}円</td></tr><tr><th>契約期間</th><td>${I.aiDate||"令和○年○月"}〜</td></tr><tr><th>導入企業</th><td>${cn}<br/>${I.address||""}</td></tr></table>
<h2>契約内容</h2><ul><li>AIを活用したカスタマーハラスメント判定システムの利用権</li><li>インシデント内容のAI分析・深刻度判定・推奨対応の提示</li><li>対応記録の管理・レポート出力機能</li><li>対応マニュアル・申請書類の自動作成機能</li><li>システム利用に関するテクニカルサポート</li></ul>
<p style="margin-top:20px">上記の通り契約・導入したことを証明いたします。</p>
<div style="display:flex;justify-content:space-between;margin-top:36px"><div><p>【導入企業】</p><p style="font-weight:700">${cn}</p><p>${I.repTitle} ${I.rep||"○○ ○○"}</p></div><div style="text-align:right"><p>【提供事業者】</p><p style="font-weight:700">${I.aiVendor||"○○株式会社"}</p></div></div>
<p style="text-align:center;margin-top:20px;color:#64748B;font-size:11px">${today} 発行</p>`);

  if(id==="ai_pamph") return w(`<div style="text-align:center;padding-top:28px"><h1 style="font-size:22px">${I.aiName}</h1><p style="color:#1D4ED8">カスタマーハラスメント対策 AIシステム</p></div>
<h2>システム概要</h2><p>${I.aiName}は、東京都カスタマー・ハラスメント防止条例に準拠したAI判定システムです。インシデントの内容をAIが分析し、カスハラ該当性・深刻度・推奨対応を判定します。</p>
<h2>主な機能</h2><table><tr><th>機能</th><th>説明</th></tr><tr><td>AI判定</td><td>テキスト・音声・ファイルからインシデント内容を分析しカスハラ該当性を判定</td></tr><tr><td>深刻度評価</td><td>5段階の深刻度レベルで評価し推奨対応を提示</td></tr><tr><td>対応マニュアル</td><td>東京都公式雛形に準拠した対応手順・報告書の生成</td></tr><tr><td>記録管理</td><td>インシデント記録の一元管理・タイムライン表示</td></tr><tr><td>書類自動作成</td><td>奨励金申請に必要な書類の自動生成・PDF出力</td></tr><tr><td>申請サポート</td><td>提出書類チェックリスト・ガイドライン情報の提供</td></tr></table>
<h2>導入効果</h2><ul><li>カスタマーハラスメントの早期発見・適切な対応判断の支援</li><li>従業員の心理的負担の軽減</li><li>対応の統一化・組織的対応の促進</li><li>東京都カスハラ防止条例への確実な準拠</li><li>奨励金申請書類の効率的な作成</li></ul>
<h2>導入企業</h2><table><tr><th>企業名</th><td>${cn}</td></tr><tr><th>導入日</th><td>${I.aiDate||""}</td></tr><tr><th>利用人数</th><td>${I.empCount||"○○"}名</td></tr></table><p style="text-align:center;margin-top:20px;color:#64748B;font-size:11px">提供: ${I.aiVendor||"○○株式会社"}</p>`);

  if(id==="ai_proof") return w(`<div class="hdr">${cn}</div><h1>AIシステム等導入<br/>社内周知証明書</h1>
<table><tr><th>システム名</th><td>${I.aiName}</td></tr><tr><th>導入日</th><td>${I.aiDate||""}</td></tr><tr><th>周知方法</th><td>${I.notifyMethod}による全従業員への配信</td></tr><tr><th>周知日</th><td>${I.notifyDate||""}</td></tr></table>
<h2>周知内容（${I.notifyMethod}本文）</h2><div class="bx"><p>件名: 【重要】カスタマーハラスメント対策AIシステム導入のお知らせ</p><p style="margin-top:8px">各位</p><p>お疲れ様です。${I.deptName||"○○部"}の${I.deptPerson||"○○"}です。</p><p>この度、東京都カスタマー・ハラスメント防止条例への対応として、カスハラ対策AIシステム「${I.aiName}」を導入いたしました。</p><p>本システムでは、カスタマーハラスメントに該当する可能性のある事案をAIが分析し、対応方針を支援します。全従業員にご利用いただけますので、ログインID・パスワードは別途個別にお知らせいたします。</p><p>ご不明点は${I.deptName||"○○部"}（TEL: ${I.deptPhone||"--"}）までお問い合わせください。</p></div>
<p style="margin:12px 0;font-weight:700">【添付】送信証拠:</p>${uploads.notice?`<div style="border:1px solid #E2E8F0;padding:8px;text-align:center"><img src="${uploads.notice.data}" style="max-width:100%;max-height:340px"/><p style="font-size:11px;color:#64748B">${uploads.notice.name}</p></div>`:`<div class="bx bxr">※メール送信画面のスクリーンショットをSTEP5でアップロードしてください</div>`}<p style="text-align:right;margin-top:16px">${today} / ${cn}</p>`);

  if(id==="ai_rule") return w(`<div class="hdr">${cn}</div><h1>${I.aiName}<br/>運用ルール</h1><p style="text-align:center;margin-bottom:16px">制定日: ${I.aiDate||today} / ${cn}</p>
<h2>1. 目的</h2><p>本ルールは、${cn}におけるカスタマーハラスメント対策AIシステム「${I.aiName}」の適正な運用に必要な事項を定めるものです。</p>
<h2>2. 利用対象者</h2><p>${cn}の全従業員（正社員・契約社員・派遣社員・アルバイト含む）。管理者アカウントは${I.deptName||"○○部"}が管理します。</p>
<h2>3. 利用場面</h2><ul><li>カスタマーハラスメントが疑われる事案が発生した場合</li><li>顧客対応中に判断に迷う場合</li><li>インシデント記録・報告書を作成する場合</li><li>対応マニュアル等の書類を参照・作成する場合</li></ul>
<h2>4. 利用手順</h2><div class="st"><div class="sn">1</div><div class="sc">システムにログイン（個人ID・パスワードを使用）</div></div><div class="st"><div class="sn">2</div><div class="sc">「AI判定」画面でインシデント内容を入力（テキスト・音声・ファイル対応）</div></div><div class="st"><div class="sn">3</div><div class="sc">AI判定結果（該当性・深刻度・推奨対応）を確認</div></div><div class="st"><div class="sn">4</div><div class="sc">判定結果を踏まえ対応マニュアルに基づき対応を実施</div></div><div class="st"><div class="sn">5</div><div class="sc">対応結果をシステムに記録として保存</div></div>
<h2>5. 注意事項</h2><ul><li>AIの判定結果は参考情報であり、最終判断は現場監督者が行うこと</li><li>個人情報の入力は必要最小限にとどめること</li><li>ログインID・パスワードは他者に共有しないこと</li><li>月間利用上限は${MONTHLY_AI_LIMIT}回/ユーザーであること</li><li>システム障害時は${I.deptName||"○○部"}（TEL: ${I.deptPhone||"--"}）に連絡すること</li></ul>
<h2>6. 管理体制</h2><table><tr><th>役割</th><th>担当</th></tr><tr><td>システム管理者</td><td>${I.deptName||"○○部"} ${I.deptPerson||"○○"}</td></tr><tr><td>問い合わせ先</td><td>TEL: ${I.deptPhone||"--"} / E-mail: ${I.deptEmail||"--"}</td></tr></table>
<h2>7. 改定</h2><p>本ルールは必要に応じて改定します。改定時は全従業員に周知します。</p><p style="text-align:right;margin-top:20px">${cn}<br/>${I.repTitle} ${I.rep||""}</p>`);

  return w(`<p>書類ID不明: ${id}</p>`);
  };

  const openPrint=(id)=>{const h=gen(id);const w2=window.open("","_blank");if(!w2){alert("ポップアップを許可してください");return;}w2.document.write(h);w2.document.close();w2.print();};

  const stepLabels=["会社基本情報","相談窓口","AIシステム情報","周知・日付","証拠アップロード","書類一覧・出力"];

  return (<div style={{padding:"32px",animation:"fadeIn 0.3s ease"}}>
    <h2 style={S.pageTitle}>申請書類 自動作成</h2>
    <p style={{fontSize:"14px",color:"#8C7E6A",marginBottom:"14px"}}>対話式で情報を入力 → 奨励金申請に必要な各種書類を自動作成 → プレビュー → PDFダウンロード</p>

    <div style={{display:"flex",gap:"2px",marginBottom:"16px"}}>{stepLabels.map((s,i)=>(<button key={i} onClick={()=>setStep(i)} style={{flex:1,padding:"7px 3px",fontSize:"13px",fontWeight:step===i?700:400,background:step===i?"#0F172A":i<step?"#DBEAFE":"#FFF",color:step===i?"#FFF":i<step?"#1D4ED8":"#94A3B8",border:"1px solid "+(step===i?"#0F172A":i<step?"#93C5FD":"#E2E8F0"),borderRadius:"3px",cursor:"pointer",fontFamily:"'Noto Sans JP',sans-serif",textAlign:"center",lineHeight:1.3}}>{i+1}. {s}</button>))}</div>

    {step===0&&<div style={S.card}>
      <div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"4px"}}>STEP 1: 会社基本情報</div>
      <div style={{fontSize:"14px",color:"#8C7E6A",marginBottom:"12px"}}>全ての書類に反映される基本情報です</div>
      <div style={S.formGrid}><RF label="会社名（正式名称）" hint="登記簿謄本と一致する名称"><input style={S.input} value={info.companyName} onChange={e=>u("companyName",e.target.value)} placeholder="例: 株式会社サンプル商事"/></RF><RF label="代表者 役職"><input style={S.input} value={info.repTitle} onChange={e=>u("repTitle",e.target.value)}/></RF></div>
      <div style={S.formGrid}><RF label="代表者 氏名"><input style={S.input} value={info.rep} onChange={e=>u("rep",e.target.value)} placeholder="例: 山田 太郎"/></RF><RF label="従業員数"><input style={S.input} value={info.empCount} onChange={e=>u("empCount",e.target.value)} placeholder="25"/></RF></div>
      <RF label="所在地"><input style={S.input} value={info.address} onChange={e=>u("address",e.target.value)} placeholder="東京都港区○○1-2-3"/></RF>
      <RF label="業種"><input style={S.input} value={info.bizType} onChange={e=>u("bizType",e.target.value)} placeholder="飲食業 / 小売業 / IT業 等"/></RF>
      <div style={{textAlign:"right",marginTop:"10px"}}><button style={S.primaryBtn} onClick={()=>setStep(1)}>次へ →</button></div>
    </div>}

    {step===1&&<div style={S.card}>
      <div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"4px"}}>STEP 2: 相談窓口・連絡先</div>
      <div style={{fontSize:"14px",color:"#8C7E6A",marginBottom:"12px"}}>マニュアル・運用ルール等に反映</div>
      <div style={{fontSize:"13px",fontWeight:600,color:"#8B6914",marginBottom:"6px"}}>社内相談窓口</div>
      <div style={S.formGrid}><RF label="担当部署"><input style={S.input} value={info.deptName} onChange={e=>u("deptName",e.target.value)} placeholder="総務部"/></RF><RF label="担当者名"><input style={S.input} value={info.deptPerson} onChange={e=>u("deptPerson",e.target.value)} placeholder="佐藤 花子"/></RF></div>
      <div style={S.formGrid}><RF label="電話番号"><input style={S.input} value={info.deptPhone} onChange={e=>u("deptPhone",e.target.value)} placeholder="03-1234-5678"/></RF><RF label="メール"><input style={S.input} value={info.deptEmail} onChange={e=>u("deptEmail",e.target.value)} placeholder="soumu@example.co.jp"/></RF></div>
      <div style={{fontSize:"13px",fontWeight:600,color:"#8B6914",margin:"12px 0 6px"}}>社外相談窓口（弁護士等）</div>
      <div style={S.formGrid}><RF label="事務所名"><input style={S.input} value={info.extName} onChange={e=>u("extName",e.target.value)} placeholder="○○法律事務所"/></RF><RF label="担当者名"><input style={S.input} value={info.extPerson} onChange={e=>u("extPerson",e.target.value)} placeholder="鈴木弁護士"/></RF></div>
      <div style={S.formGrid}><RF label="電話番号"><input style={S.input} value={info.extPhone} onChange={e=>u("extPhone",e.target.value)}/></RF><RF label="メール"><input style={S.input} value={info.extEmail} onChange={e=>u("extEmail",e.target.value)}/></RF></div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:"10px"}}><button style={S.ghostBtn} onClick={()=>setStep(0)}>← 戻る</button><button style={S.primaryBtn} onClick={()=>setStep(2)}>次へ →</button></div>
    </div>}

    {step===2&&<div style={S.card}>
      <div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"4px"}}>STEP 3: AIシステム情報</div>
      <div style={{fontSize:"14px",color:"#8C7E6A",marginBottom:"12px"}}>取組② AIシステム導入に関する書類に反映</div>
      <div style={S.formGrid}><RF label="システム名称"><input style={S.input} value={info.aiName} onChange={e=>u("aiName",e.target.value)}/></RF><RF label="提供事業者名"><input style={S.input} value={info.aiVendor} onChange={e=>u("aiVendor",e.target.value)} placeholder="○○テクノロジーズ株式会社"/></RF></div>
      <div style={S.formGrid}><RF label="契約種別"><select style={S.select} value={info.aiContract} onChange={e=>u("aiContract",e.target.value)}><option>月額サービス契約</option><option>年間ライセンス契約</option><option>買い切り</option></select></RF><RF label="契約金額（税込・円）"><input style={S.input} value={info.aiPrice} onChange={e=>u("aiPrice",e.target.value)} placeholder="50,000"/></RF></div>
      <RF label="契約日 / 導入日"><input type="date" style={S.input} value={info.aiDate} onChange={e=>u("aiDate",e.target.value)}/></RF>
      <div style={{fontSize:"13px",fontWeight:600,color:"#8B6914",margin:"12px 0 6px"}}>マニュアル判断基準の数値</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"10px"}}><RF label="時間上限（分）"><input style={S.input} type="number" value={info.limitMin} onChange={e=>u("limitMin",e.target.value)}/></RF><RF label="要求反復上限（回）"><input style={S.input} type="number" value={info.limitCount} onChange={e=>u("limitCount",e.target.value)}/></RF><RF label="退去命令上限（回）"><input style={S.input} type="number" value={info.limitExit} onChange={e=>u("limitExit",e.target.value)}/></RF></div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:"10px"}}><button style={S.ghostBtn} onClick={()=>setStep(1)}>← 戻る</button><button style={S.primaryBtn} onClick={()=>setStep(3)}>次へ →</button></div>
    </div>}

    {step===3&&<div style={S.card}>
      <div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"4px"}}>STEP 4: 周知・日付情報</div>
      <div style={{fontSize:"14px",color:"#8C7E6A",marginBottom:"12px"}}>周知証明書に反映</div>
      <div style={S.formGrid}><RF label="社内周知日"><input type="date" style={S.input} value={info.notifyDate} onChange={e=>u("notifyDate",e.target.value)}/></RF><RF label="社内周知方法"><select style={S.select} value={info.notifyMethod} onChange={e=>u("notifyMethod",e.target.value)}><option>社内メール</option><option>社内掲示板</option><option>社内チャット（Slack等）</option><option>全社ミーティング</option></select></RF></div>
      <RF label="基本方針 掲載先HP URL" hint="基本方針を掲載したページ"><input style={S.input} value={info.hpUrl} onChange={e=>u("hpUrl",e.target.value)} placeholder="https://www.example.co.jp/policy"/></RF>

      <div style={{background:lpUnlocked?"#F0FDF4":"#F8FAFC",border:"1px solid "+(lpUnlocked?"#BBF7D0":"#E2E8F0"),borderRadius:"6px",padding:"14px 16px",marginTop:"12px"}}>
        <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"6px"}}>
          <span style={{fontSize:"13px"}}>{lpUnlocked?"":"🔒"}</span>
          <div style={{fontSize:"13px",fontWeight:700,color:lpUnlocked?"#15803D":"#64748B"}}>簡易LP自動生成{lpUnlocked?"（有効）":"（有料オプション）"}</div>
        </div>
        {!lpUnlocked?<>
          <div style={{fontSize:"13px",color:"#5A4F42",lineHeight:1.7,marginBottom:"10px"}}>HPをお持ちでない場合、AIが会社情報・基本方針を掲載したレスポンシブ対応の簡易LPページを自動生成します。ご購入後、管理者がオプションを有効にすると利用可能になります。</div>
          <button style={{padding:"8px 16px",fontSize:"13px",fontWeight:600,background:"#0F172A",color:"#FFF",border:"none",borderRadius:"5px",cursor:"pointer",fontFamily:"'Noto Sans JP',sans-serif",display:"flex",alignItems:"center",gap:"6px"}} onClick={()=>window.open("https://your-base-shop.thebase.in/items/xxxxx","_blank")}>
            <span>🔒</span> オプションを購入する（BASEショップ）
          </button>
          <div style={{fontSize:"13px",color:"#A09888",marginTop:"6px"}}>※購入後、管理者画面「設定」でオプションを有効にしてください</div>
        </>:<>
          <div style={{fontSize:"13px",color:"#15803D",lineHeight:1.7,marginBottom:"10px"}}>STEP1〜3の入力情報を反映した簡易LPを生成します。プレビューで確認後、HTMLダウンロードまたはそのまま表示できます。</div>
          <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
            <button style={{...S.primaryBtn,background:"#15803D"}} onClick={()=>setLpPreview(true)}>LPをプレビュー表示</button>
            <button style={S.secondaryBtn} onClick={()=>{const h=genLp();const b=new Blob([h],{type:"text/html;charset=utf-8"});const u2=URL.createObjectURL(b);const a=document.createElement("a");a.href=u2;a.download=`${info.companyName||"会社名"}_カスハラ基本方針LP.html`;a.click();URL.revokeObjectURL(u2);}}>HTMLダウンロード</button>
          </div>
          <div style={{fontSize:"13px",color:"#047857",marginTop:"6px",lineHeight:1.6}}>※プレビューで確認 → スクリーンショットをSTEP5でアップロードすれば社外周知証明に使えます<br/>※HTMLをサーバーにアップすればHPとして公開可能（スマホ対応済み）</div>
        </>}
      </div>

      <div style={{display:"flex",justifyContent:"space-between",marginTop:"10px"}}><button style={S.ghostBtn} onClick={()=>setStep(2)}>← 戻る</button><button style={S.primaryBtn} onClick={()=>setStep(4)}>次へ →</button></div>
    </div>}

    {lpPreview&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.7)",zIndex:110,display:"flex",flexDirection:"column"}} onClick={()=>setLpPreview(false)}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 16px",background:"#0F172A"}}>
        <div style={{color:"#F8FAFC",fontSize:"13px",fontWeight:600}}>LP プレビュー — {info.companyName||"○○株式会社"}</div>
        <div style={{display:"flex",gap:"6px"}}>
          <button style={{padding:"5px 12px",fontSize:"13px",fontWeight:600,background:"#15803D",color:"#FFF",border:"none",borderRadius:"4px",cursor:"pointer"}} onClick={e=>{e.stopPropagation();const h=genLp();const w2=window.open("","_blank");if(w2){w2.document.write(h);w2.document.close();}}}>新しいタブで開く</button>
          <button style={{padding:"5px 12px",fontSize:"13px",fontWeight:600,background:"#1D4ED8",color:"#FFF",border:"none",borderRadius:"4px",cursor:"pointer"}} onClick={e=>{e.stopPropagation();const h=genLp();const b=new Blob([h],{type:"text/html;charset=utf-8"});const u2=URL.createObjectURL(b);const a=document.createElement("a");a.href=u2;a.download=`${info.companyName||"会社名"}_カスハラ基本方針LP.html`;a.click();URL.revokeObjectURL(u2);}}>HTMLダウンロード</button>
          <button style={{padding:"5px 12px",fontSize:"13px",fontWeight:600,background:"#475569",color:"#FFF",border:"none",borderRadius:"4px",cursor:"pointer"}} onClick={()=>setLpPreview(false)}>閉じる</button>
        </div>
      </div>
      <div style={{flex:1,overflow:"hidden"}} onClick={e=>e.stopPropagation()}><iframe srcDoc={genLp()} style={{width:"100%",height:"100%",border:"none"}} title="LP Preview"/></div>
    </div>}

    {step===4&&<div style={S.card}>
      <div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"4px"}}>STEP 5: 証拠ファイルのアップロード</div>
      <div style={{fontSize:"14px",color:"#8C7E6A",marginBottom:"12px"}}>周知証明書に添付する証拠画像（jpg / png）</div>
      {[["notice","社内周知メール・通知のスクリーンショット","カスハラマニュアル・基本方針・AIシステム導入の周知メール送信画面をキャプチャ"],["hp","HP掲載画面のスクリーンショット","基本方針を掲載したHPページのスクリーンショット"],["poster","店頭掲示・ポスター写真（任意）","録音録画実施中の掲示物や店頭案内の写真"]].map(([key,title,desc])=>(<div key={key} style={{background:"#FAF7F2",border:"1px solid #E0D9CE",borderRadius:"4px",padding:"12px",marginBottom:"8px"}}><div style={{fontSize:"13px",fontWeight:600,color:"#0F172A",marginBottom:"3px"}}>{title}</div><div style={{fontSize:"14px",color:"#8C7E6A",marginBottom:"6px"}}>{desc}</div><input type="file" accept="image/*" onChange={e=>handleFile(key,e)} style={{fontSize:"13px"}}/>{uploads[key]&&<div style={{marginTop:"4px",fontSize:"13px",color:"#15803D"}}>アップロード済み: {uploads[key].name}</div>}</div>))}
      <div style={{display:"flex",justifyContent:"space-between",marginTop:"10px"}}><button style={S.ghostBtn} onClick={()=>setStep(3)}>← 戻る</button><button style={S.primaryBtn} onClick={()=>setStep(5)}>次へ: 書類一覧 →</button></div>
    </div>}

    {step===5&&<div>
      <div style={{...S.card,marginBottom:"10px",background:"#EFF6FF",border:"1px solid #93C5FD"}}>
        <div style={{fontSize:"13px",fontWeight:700,color:"#8B6914",marginBottom:"6px"}}>入力情報サマリー</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"3px 14px",fontSize:"13px",color:"#5A4F42",lineHeight:1.8}}>
          <div>会社名: <b>{cn}</b></div><div>代表者: <b>{info.repTitle} {info.rep||"未入力"}</b></div>
          <div>AIシステム: <b>{info.aiName}</b></div><div>契約額: <b>{info.aiPrice||"未入力"}円</b></div>
          <div>社内窓口: <b>{info.deptName||"未入力"} {info.deptPerson||""}</b></div><div>周知日: <b>{info.notifyDate||"未入力"}</b></div>
          <div>証拠画像: <b>{[uploads.notice,uploads.hp,uploads.poster].filter(Boolean).length}件</b></div>
          <div><button style={{...S.ghostBtn,padding:"2px 8px",fontSize:"13px"}} onClick={()=>setStep(0)}>情報を修正する</button></div>
        </div>
      </div>

      <div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"8px"}}>生成可能な書類一覧（{DOCS.length}種類）</div>
      {DOCS.map(d=>(<div key={d.id} style={{...S.card,marginBottom:"6px",padding:"12px 14px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:"16px",fontWeight:600,color:"#2C2418"}}>{d.name}</div>
            <div style={{fontSize:"13px",color:"#8B6914",fontFamily:"'Inter','Noto Sans JP',sans-serif",marginTop:"1px"}}>{fname(d)}</div>
          </div>
          <div style={{display:"flex",gap:"5px",flexShrink:0,marginLeft:"8px"}}>
            <button style={{...S.secondaryBtn,padding:"4px 10px",fontSize:"13px"}} onClick={()=>setPreview(d.id)}>プレビュー</button>
            <button style={{...S.primaryBtn,padding:"4px 10px",fontSize:"13px"}} onClick={()=>openPrint(d.id)}>PDF出力</button>
          </div>
        </div>
      </div>))}
      <div style={{fontSize:"13px",color:"#8C7E6A",lineHeight:1.7,marginTop:"10px"}}>
        ※「PDF出力」→ ブラウザ印刷画面 →「送信先: PDFに保存」→ ファイル名を上記の指定名に変更して保存<br/>
        ※A4縦で出力。奨励金申請にそのまま使用できます。
      </div>
    </div>}

    {preview&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.6)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}} onClick={()=>setPreview(null)}>
      <div style={{background:"#FFF",borderRadius:"8px",width:"100%",maxWidth:"840px",maxHeight:"90vh",display:"flex",flexDirection:"column",overflow:"hidden"}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid #E2E8F0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{fontSize:"13px",fontWeight:700}}>{DOCS.find(d=>d.id===preview)?.name}</div><div style={{fontSize:"13px",color:"#8B6914"}}>{fname(DOCS.find(d=>d.id===preview)||DOCS[0])}</div></div>
          <div style={{display:"flex",gap:"5px"}}><button style={S.primaryBtn} onClick={()=>openPrint(preview)}>PDF出力</button><button style={S.ghostBtn} onClick={()=>setPreview(null)}>閉じる</button></div>
        </div>
        <div style={{flex:1,overflow:"auto"}}><iframe srcDoc={gen(preview)} style={{width:"100%",height:"760px",border:"none"}} title="preview"/></div>
      </div>
    </div>}
  </div>);
}

function SubsidyInfoPage({ setTab }) {
  const [sec,setSec]=useState("overview");
  const tabs=[{id:"overview",label:"制度概要"},{id:"eligible",label:"対象・要件"},{id:"initiatives",label:"対象取組"},{id:"flow",label:"申請の流れ"},{id:"notes",label:"注意事項"}];
  const SB=({title,children,color="#1D4ED8"})=>(<div style={{background:"#FAF7F2",border:"1px solid #E0D9CE",borderLeft:`4px solid ${color}`,borderRadius:"4px",padding:"14px 16px",marginBottom:"10px"}}>{title&&<div style={{fontSize:"13px",fontWeight:700,color,marginBottom:"8px"}}>{title}</div>}{children}</div>);
  const IT=({children})=>(<div style={{fontSize:"13px",color:"#5A4F42",lineHeight:1.7,paddingLeft:"10px",borderLeft:"2px solid #E2E8F0",marginBottom:"5px"}}>{children}</div>);
  return (<div style={{padding:"32px",animation:"fadeIn 0.3s ease"}}>
    <h2 style={S.pageTitle}>東京都カスハラ奨励金</h2>
    <p style={{fontSize:"14px",color:"#8C7E6A",marginBottom:"14px"}}>東京都カスタマー・ハラスメント防止条例に基づく奨励金制度の詳細情報</p>

    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"18px"}}>
      <button onClick={()=>setTab("docs")} style={{...S.card,textAlign:"left",cursor:"pointer",border:"1px solid #DBEAFE",background:"linear-gradient(135deg,#EFF6FF,#F8FAFC)",transition:"all 0.15s"}} onMouseEnter={e=>e.currentTarget.style.borderColor="#C4A35A"} onMouseLeave={e=>e.currentTarget.style.borderColor="#DBEAFE"}>
        <div style={{fontSize:"13px",fontWeight:700,color:"#8B6914",marginBottom:"4px"}}>書類作成サポート →</div>
        <div style={{fontSize:"13px",color:"#8C7E6A",lineHeight:1.6}}>対話式で情報を入力し、マニュアル・契約書・領収書・周知証等の申請書類を自動作成</div></button>
      <button onClick={()=>setTab("checklist")} style={{...S.card,textAlign:"left",cursor:"pointer",border:"1px solid #DBEAFE",background:"linear-gradient(135deg,#EFF6FF,#F8FAFC)",transition:"all 0.15s"}} onMouseEnter={e=>e.currentTarget.style.borderColor="#C4A35A"} onMouseLeave={e=>e.currentTarget.style.borderColor="#DBEAFE"}>
        <div style={{fontSize:"13px",fontWeight:700,color:"#8B6914",marginBottom:"4px"}}>申請チェックリスト →</div>
        <div style={{fontSize:"13px",color:"#8C7E6A",lineHeight:1.6}}>法人・個人事業主別の提出書類一覧・補足説明・添付例をチェック形式で確認</div></button>
    </div>

    <div style={{display:"flex",gap:"4px",marginBottom:"16px",flexWrap:"wrap"}}>{tabs.map(t=>(<button key={t.id} onClick={()=>setSec(t.id)} style={{padding:"6px 12px",fontSize:"13px",fontWeight:sec===t.id?700:500,background:sec===t.id?"#0F172A":"#FFF",color:sec===t.id?"#FFF":"#64748B",border:"1px solid "+(sec===t.id?"#0F172A":"#E2E8F0"),borderRadius:"4px",cursor:"pointer",fontFamily:"'Noto Sans JP','Inter',sans-serif"}}>{t.label}</button>))}</div>

    {sec==="overview"&&<div style={S.card}>
      <div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"10px"}}>カスタマーハラスメント防止対策推進 奨励金</div>
      <SB title="制度の趣旨" color="#1D4ED8">
        <div style={{fontSize:"13px",color:"#5A4F42",lineHeight:1.8}}>東京都では令和7年4月から施行される「カスタマー・ハラスメント防止条例」に基づき、中小企業が取り組むカスハラ防止対策を支援するため、奨励金制度を設けています。カスハラ対策に必要な設備導入やシステム構築等の費用を一定額支援します。</div>
      </SB>
      <SB title="奨励金額" color="#15803D">
        <div style={{fontSize:"18px",fontWeight:800,color:"#15803D",fontFamily:"'Inter',sans-serif",marginBottom:"4px"}}>一律 400,000円（定額）</div>
        <div style={{fontSize:"13px",color:"#5A4F42"}}>対象取組のうち2つ以上を実施し、各取組に必要な提出書類を全て提出した場合に支給されます。</div>
      </SB>
      <SB title="申請方法" color="#6D28D9">
        <div style={{fontSize:"13px",color:"#5A4F42",lineHeight:1.8}}>jGrants（電子申請システム）を通じて申請します。書類は全てPDFで提出し、指定のファイル名で保存する必要があります。申請から審査・支給まで一定期間がかかります。</div>
      </SB>
    </div>}

    {sec==="eligible"&&<div style={S.card}>
      <div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"10px"}}>対象事業者・申請要件</div>
      <SB title="対象事業者" color="#1D4ED8">
        <IT>都内で事業を営む中小企業（法人・個人事業主）</IT>
        <IT>常時使用する従業員が2名以上（代表者は除く）</IT>
        <IT>みなし大企業を除く</IT>
        <IT>暴力団関係者でないこと</IT>
        <IT>過去にこの奨励金の交付を受けていないこと</IT>
      </SB>
      <SB title="中小企業の定義" color="#047857">
        <div style={{fontSize:"13px",color:"#5A4F42",lineHeight:1.8}}>業種ごとに資本金または従業員数の要件が異なります。製造業・建設業・運輸業等は資本金3億円以下または従業員300人以下、卸売業は1億円以下/100人以下、小売業は5000万円以下/50人以下、サービス業は5000万円以下/100人以下です。</div>
      </SB>
      <SB title="申請に必要な前提" color="#B45309">
        <IT>カスタマーハラスメント対策に関するマニュアル（必須9項目網羅）を作成済み</IT>
        <IT>カスハラに対する基本方針を策定し社内外に周知済み</IT>
        <IT>対象取組を2つ以上実施済みまたは実施予定</IT>
        <IT>申請書類を全てPDF（A4縦）で準備可能</IT>
      </SB>
    </div>}

    {sec==="initiatives"&&<div style={S.card}>
      <div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"10px"}}>対象取組（2つ以上を実施）</div>
      <SB title="取組① 録音・録画機器等の設置" color="#B91C1C">
        <div style={{fontSize:"13px",color:"#5A4F42",lineHeight:1.8,marginBottom:"8px"}}>カスハラ防止を目的として、事業所に録音・録画機器を設置する取組。機器の購入費用は奨励金の対象範囲で対応。</div>
        <div style={{fontSize:"12px",color:"#8C7E6A"}}>必要書類: 録音録画機器の領収書・パンフレット・設置写真・社内周知証明</div>
      </SB>
      <SB title="取組② AIシステム等の導入" color="#1D4ED8">
        <div style={{fontSize:"13px",color:"#5A4F42",lineHeight:1.8,marginBottom:"8px"}}>カスハラ対策に活用するAI判定システム等を導入する取組。本システム「トーカスAI」の導入がこれに該当します。</div>
        <div style={{fontSize:"12px",color:"#8C7E6A"}}>必要書類: AIシステム領収書/契約書・パンフレット・社内周知証明・運用ルール</div>
      </SB>
      <SB title="取組③ 外部資源の活用" color="#6D28D9">
        <div style={{fontSize:"13px",color:"#5A4F42",lineHeight:1.8,marginBottom:"6px"}}>外部の専門リソースを活用する取組。以下の3種類があります:</div>
        <div style={{background:"#FFF",border:"1px solid #E0D9CE",borderRadius:"4px",padding:"10px",marginBottom:"4px"}}><div style={{fontSize:"13px",fontWeight:700,color:"#6D28D9"}}>③ア 外部相談窓口との継続契約</div><div style={{fontSize:"12px",color:"#8C7E6A"}}>弁護士・社労士等との顧問契約。契約書・請求書等が必要</div></div>
        <div style={{background:"#FFF",border:"1px solid #E0D9CE",borderRadius:"4px",padding:"10px",marginBottom:"4px"}}><div style={{fontSize:"13px",fontWeight:700,color:"#6D28D9"}}>③イ 外部講師による研修</div><div style={{fontSize:"12px",color:"#8C7E6A"}}>カスハラ対策の専門研修。研修カリキュラム・修了証・写真等が必要</div></div>
        <div style={{background:"#FFF",border:"1px solid #E0D9CE",borderRadius:"4px",padding:"10px"}}><div style={{fontSize:"13px",fontWeight:700,color:"#6D28D9"}}>③ウ 警備員の配置</div><div style={{fontSize:"12px",color:"#8C7E6A"}}>事業所への警備配置。契約書・配置証明等が必要</div></div>
      </SB>
    </div>}

    {sec==="flow"&&<div style={S.card}>
      <div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"10px"}}>申請の流れ</div>
      {[["1","マニュアル・基本方針の作成","「書類作成サポート」で対話式入力→ マニュアル・基本方針等を自動生成・PDFダウンロード"],["2","対象取組の実施（2つ以上）","取組①②③から2つ以上を実施。本システム導入は取組②に該当"],["3","社内・社外周知","マニュアル・基本方針・AIシステム導入を従業員に周知。HP掲載で社外周知。証拠画像をアップロード"],["4","提出書類の準備","「申請チェックリスト」で必要書類を確認。「書類作成サポート」で自動生成→ 全てA4縦PDFで保存"],["5","jGrantsで申請","電子申請システム jGrants にログイン。指定ファイル名でPDFをアップロードして申請"],["6","審査・交付決定","東京都による審査後、交付決定通知。指定口座に40万円が振り込まれます"]].map(([n,title,desc])=>(
        <div key={n} style={{display:"flex",gap:"12px",marginBottom:"10px"}}><div style={{width:"32px",height:"32px",borderRadius:"4px",background:"#0F172A",color:"#FFF",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:"13px",fontFamily:"'Inter',sans-serif",flexShrink:0}}>{n}</div><div><div style={{fontSize:"16px",fontWeight:600,color:"#2C2418"}}>{title}</div><div style={{fontSize:"13px",color:"#5A4F42",lineHeight:1.7}}>{desc}</div></div></div>
      ))}
    </div>}

    {sec==="notes"&&<div style={S.card}>
      <div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"10px"}}>申請時の注意事項</div>
      <SB title="書類全般" color="#B91C1C">
        <IT>全ての書類はPDF形式（A4縦）で提出</IT>
        <IT>写真・画像はjpg / png 可（A4に貼り付けたPDFでも可）</IT>
        <IT>指定のファイル名で保存すること（「申請チェック」で確認可能）</IT>
        <IT>申請チェックシートそのものは提出不要（確認用のみ）</IT>
      </SB>
      <SB title="有効期限" color="#B45309">
        <IT>登記簿謄本・納税証明書等は発行から3ヶ月以内のもの</IT>
        <IT>申請前に各証明書の有効期限を確認すること</IT>
      </SB>
      <SB title="マニュアルの必須項目" color="#1D4ED8">
        <IT>以下の9項目を全て網羅する必要あり: 定義、基本方針、心構え、初期対応、判断基準、対応フロー、行為別対応例、警察連携、社内体制</IT>
        <IT>「書類作成サポート」で生成するマニュアルは全項目を自動網羅しています</IT>
      </SB>
      <SB title="取組に関する注意" color="#047857">
        <IT>取組は申請日より前に実施・購入済みであること</IT>
        <IT>領収書等の日付は申請日以前であること</IT>
        <IT>同一の取組で他の助成金・補助金を受けている場合は対象外</IT>
      </SB>
    </div>}
  </div>);
}

function TopPage({ user, incidents, setTab }) {
  const info=getMembershipInfo(user);const st=STATUS_MAP[info.status];
  const recent=incidents.slice(-5).reverse();const highCount=incidents.filter(i=>i.severity>=60).length;
  const [announcements,setAnnouncements]=useState([]);
  useEffect(()=>{(async()=>{setAnnouncements(await Storage.get("announcements")||[]);})();},[]);
  const ATYPES={info:{bg:"#DBEAFE",color:"#8B6914",icon:"📢"},important:{bg:"#FEF3C7",color:"#92400E",icon:"⚠️"},urgent:{bg:"#FEE2E2",color:"#B91C1C",icon:"🚨"},update:{bg:"#DCFCE7",color:"#15803D",icon:"🔄"}};
  const Nav=({id,label,desc})=>(<button onClick={()=>setTab(id)} style={{...S.card,textAlign:"left",cursor:"pointer",border:"1px solid #E0D9CE",transition:"all 0.15s"}} onMouseEnter={e=>e.currentTarget.style.borderColor="#C4A35A"} onMouseLeave={e=>e.currentTarget.style.borderColor="#E0D9CE"}><div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"4px"}}>{label}</div><div style={{fontSize:"12px",color:"#8C7E6A",lineHeight:1.6}}>{desc}</div></button>);
  return (<div style={{padding:"32px",animation:"fadeIn 0.3s ease"}}>
    <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"4px"}}><Logo size="lg"/></div>
    <p style={{fontSize:"14px",color:"#8C7E6A",marginBottom:"20px"}}>東京都カスハラ専用のAIサポートアプリ【トーカスAI】</p>
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"12px",marginBottom:"20px"}}>
      <div style={S.statCard}><div style={{fontSize:"12px",color:"#8C7E6A"}}>会員種別</div><div style={{fontSize:"18px",fontWeight:700,color:info.type.color,marginTop:"4px"}}>{info.type.label}</div><div style={{display:"inline-block",padding:"2px 8px",borderRadius:"3px",fontSize:"13px",fontWeight:600,background:st.bg,color:st.color,marginTop:"4px"}}>{st.label}</div></div>
      <div style={S.statCard}><div style={{fontSize:"12px",color:"#8C7E6A"}}>インシデント記録</div><div style={{fontSize:"18px",fontWeight:700,color:"#2C2418",fontFamily:"'Inter',sans-serif",marginTop:"4px"}}>{incidents.length}</div><div style={{fontSize:"13px",color:"#A09888"}}>{highCount>0?`${highCount}件が高リスク`:"高リスクなし"}</div></div>
      <div style={S.statCard}><div style={{fontSize:"12px",color:"#8C7E6A"}}>AI判定済み</div><div style={{fontSize:"18px",fontWeight:700,color:"#2C2418",fontFamily:"'Inter',sans-serif",marginTop:"4px"}}>{incidents.filter(i=>i.aiJudgment).length}</div><div style={{fontSize:"13px",color:"#A09888"}}>全{incidents.length}件中</div></div>
    </div>
    {announcements.length>0&&<><h3 style={{...S.sectionTitle,marginBottom:"8px"}}>運営よりお知らせ</h3>
    <div style={{marginBottom:"16px"}}>{announcements.slice(0,5).map((a,i)=>{const t=ATYPES[a.type]||ATYPES.info;return(<div key={i} style={{...S.card,marginBottom:"6px",padding:"12px 14px",borderLeft:`4px solid ${t.color}`}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:"10px"}}><span style={{fontSize:"18px",flexShrink:0,marginTop:"1px"}}>{t.icon}</span>
        <div style={{flex:1,minWidth:0}}><div style={{display:"flex",alignItems:"center",gap:"6px",marginBottom:"3px"}}><span style={{fontSize:"13px",padding:"1px 6px",borderRadius:"3px",fontWeight:600,background:t.bg,color:t.color}}>{({info:"お知らせ",important:"重要",urgent:"緊急",update:"更新"})[a.type]||"お知らせ"}</span><span style={{fontSize:"14px",fontWeight:600,color:"#2C2418"}}>{a.title}</span></div>{a.body&&<div style={{fontSize:"13px",color:"#5A4F42",lineHeight:1.7,whiteSpace:"pre-wrap"}}>{a.body}</div>}<div style={{fontSize:"13px",color:"#A09888",marginTop:"3px"}}>{new Date(a.date).toLocaleDateString("ja-JP",{year:"numeric",month:"long",day:"numeric"})}</div></div>
      </div></div>);})}</div></>}
    <h3 style={{...S.sectionTitle,marginBottom:"10px"}}>主要メニュー</h3>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"20px"}}>
      <Nav id="subsidy_info" label="東京都カスハラ奨励金" desc="奨励金制度の詳細説明・書類作成サポート・申請チェックリストをワンストップで提供"/>
      <Nav id="judge" label="AI判定" desc="インシデント内容をAIが分析し、カスハラ該当性・深刻度・推奨対応を判定します"/>
      <Nav id="manual" label="対応マニュアル" desc="東京都公式雛形に準拠した対応手順・報告書の作成とPDFダウンロード"/>
      <Nav id="guidelines" label="ガイドライン" desc="東京都カスハラ防止条例の詳細、定義、事業者の義務、罰則等を掲載"/>
      <Nav id="history" label="記録一覧" desc="これまでのインシデント記録とAI判定結果の確認"/>
    </div>
    {recent.length>0&&<><h3 style={{...S.sectionTitle,marginBottom:"8px"}}>最近のインシデント</h3>
    <div style={S.tableWrap}><table style={S.table}><thead><tr><th style={S.th}>日時</th><th style={S.th}>類型</th><th style={S.th}>深刻度</th></tr></thead><tbody>{recent.map((inc,i)=>{const sev=getSeverityColor(inc.severity);return(<tr key={i} style={S.tr}><td style={S.td}>{new Date(inc.date).toLocaleDateString("ja-JP")}</td><td style={S.td}>{inc.type}</td><td style={S.td}><span style={{...S.badge,background:sev.bg,color:sev.text}}>{inc.severity}%</span></td></tr>);})}</tbody></table></div></>}

    <h3 style={{...S.sectionTitle,marginTop:"24px",marginBottom:"10px"}}>システムスペック・準拠情報</h3>
    <div style={{...S.card,padding:0,overflow:"hidden"}}>
      <div style={{background:"linear-gradient(135deg,#111827,#1E293B)",padding:"20px 22px",display:"flex",alignItems:"center",gap:"14px"}}>
        <div style={{width:"44px",height:"44px",borderRadius:"10px",background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center"}}><Logo size="sm" light/></div>
        <div><div style={{fontSize:"17px",fontWeight:700,color:"#E2E8F0",letterSpacing:"0.3px"}}>トーカスAI — システム仕様</div><div style={{fontSize:"12px",color:"#7C8DA6",marginTop:"2px"}}>東京都カスタマー・ハラスメント防止条例 準拠AIサポートシステム</div></div>
      </div>
      <div style={{padding:"18px 22px"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"14px",marginBottom:"16px"}}>
          <div>
            <div style={{fontSize:"10px",fontWeight:600,color:"#A09888",letterSpacing:"0.5px",marginBottom:"8px"}}>基本情報</div>
            {[["システム名称","トーカスAI（東京カスハラ専用AIサポート）"],["サービス形態","月額SaaSクラウドサービス"],["準拠法令","東京都カスタマー・ハラスメント防止条例（令和6年10月制定）"],["準拠マニュアル","東京都カスハラ防止 各団体共通マニュアル雛形"],["奨励金取組区分","取組② AIを活用したシステム等の導入"]].map(([k,v],i)=>(<div key={i} style={{display:"flex",fontSize:"12.5px",lineHeight:1.5,marginBottom:"6px",gap:"4px"}}><span style={{color:"#8C7E6A",flexShrink:0,minWidth:"110px",fontWeight:500}}>{k}</span><span style={{color:"#2C2418",fontWeight:500}}>{v}</span></div>))}
          </div>
          <div>
            <div style={{fontSize:"10px",fontWeight:600,color:"#A09888",letterSpacing:"0.5px",marginBottom:"8px"}}>AI エンジン</div>
            {[["AIモデル","Claude（Anthropic社）"],["APIバージョン","Claude Sonnet 4.5"],["処理方式","リアルタイムAPI連携（クラウド）"],["月間利用上限",MONTHLY_AI_LIMIT+"回 / ユーザー"],["応答速度","平均3〜8秒（通信環境による）"]].map(([k,v],i)=>(<div key={i} style={{display:"flex",fontSize:"12.5px",lineHeight:1.5,marginBottom:"6px",gap:"4px"}}><span style={{color:"#8C7E6A",flexShrink:0,minWidth:"110px",fontWeight:500}}>{k}</span><span style={{color:"#2C2418",fontWeight:500}}>{v}</span></div>))}
          </div>
        </div>

        <div style={{borderTop:"1px solid #F1F3F6",paddingTop:"14px",marginBottom:"14px"}}>
          <div style={{fontSize:"10px",fontWeight:600,color:"#A09888",letterSpacing:"0.5px",marginBottom:"10px"}}>搭載機能一覧</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px"}}>
            {[["AI カスハラ判定","インシデント内容をAIが分析し、カスハラ該当性・深刻度（0〜100%）・推奨対応を自動判定","#3B82F6"],
              ["対応マニュアル生成","東京都公式雛形に準拠した9必須項目を網羅するカスハラ対策マニュアルをAI自動生成","#10B981"],
              ["インシデント記録","日時・類型・詳細・AI判定結果を記録管理。報告書PDF出力に対応","#8B5CF6"],
              ["音声入力対応","Web Speech APIによる音声入力で、現場でのインシデント報告を迅速化","#F59E0B"],
              ["奨励金申請書類生成","支給申請に必要な9種類の書類をAI自動生成。チェックリストで漏れ防止","#EF4444"],
              ["顧客メモ管理","顧客ごとの対応記録・タイムラインで継続的なインシデント管理を実現","#06B6D4"]
            ].map(([title,desc,color],i)=>(<div key={i} style={{background:"#FAF7F2",borderRadius:"8px",padding:"12px",borderLeft:`3px solid ${color}`}}>
              <div style={{fontSize:"12px",fontWeight:600,color:"#2C2418",marginBottom:"4px"}}>{title}</div>
              <div style={{fontSize:"12px",color:"#8C7E6A",lineHeight:1.6}}>{desc}</div>
            </div>))}
          </div>
        </div>

        <div style={{borderTop:"1px solid #F1F3F6",paddingTop:"14px",marginBottom:"14px"}}>
          <div style={{fontSize:"10px",fontWeight:600,color:"#A09888",letterSpacing:"0.5px",marginBottom:"10px"}}>マニュアル必須9項目 対応状況（東京都ガイドライン準拠）</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"6px"}}>
            {["カスタマーハラスメントの定義","カスタマーハラスメントに対する基本方針","顧客対応における基本的な心構え・姿勢","カスハラ行為への初期対応","カスハラ該当性の判断基準","カスハラ対応の流れ（組織的対応）","行為類型別の具体的対応例","警察との連携手順","社内相談体制・再発防止策"].map((item,i)=>(<div key={i} style={{display:"flex",alignItems:"flex-start",gap:"6px",padding:"7px 10px",background:"#F2F8EC",borderRadius:"6px",border:"1px solid #BBF7D0"}}>
              <span style={{color:"#16A34A",fontSize:"13px",fontWeight:700,flexShrink:0,lineHeight:1}}>✓</span>
              <span style={{fontSize:"11.5px",color:"#15803D",lineHeight:1.4,fontWeight:500}}>{item}</span>
            </div>))}
          </div>
          <div style={{fontSize:"11px",color:"#8C7E6A",marginTop:"8px",lineHeight:1.6}}>上記9項目は「書類作成サポート」機能により自動生成されるマニュアルに全て含まれます。東京都「カスタマー・ハラスメント防止のための各団体共通マニュアル」雛形に準拠しています。</div>
        </div>

        <div style={{borderTop:"1px solid #F1F3F6",paddingTop:"14px",marginBottom:"14px"}}>
          <div style={{fontSize:"10px",fontWeight:600,color:"#A09888",letterSpacing:"0.5px",marginBottom:"10px"}}>AI判定基準（3軸評価）</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px"}}>
            {[["① 要求態様","侮辱的暴言、差別的・性的言動、暴力・脅迫、恐怖を与える口調、無断撮影・SNS公開","#EF4444"],
              ["② 要求内容","不当な金品要求、土下座・書面での謝罪強要、従業員解雇要求、社会通念を超える要求","#F59E0B"],
              ["③ 時間・回数・頻度","長時間拘束、繰り返しの退去拒否、執拗な要求の反復、業務時間外の苦情","#3B82F6"]
            ].map(([title,desc,color],i)=>(<div key={i} style={{background:"#FFF",borderRadius:"8px",padding:"12px",border:"1px solid #E0D9CE"}}>
              <div style={{fontSize:"13px",fontWeight:600,color,marginBottom:"4px"}}>{title}</div>
              <div style={{fontSize:"12px",color:"#8C7E6A",lineHeight:1.6}}>{desc}</div>
            </div>))}
          </div>
          <div style={{fontSize:"11px",color:"#8C7E6A",marginTop:"8px",lineHeight:1.6}}>東京都ガイドライン「カスタマーハラスメントの判断」に準拠した3軸（要求態様・要求内容・時間/回数/頻度）でAIが総合的に深刻度を算出します。機械的な判断ではなく、個別事情を考慮した柔軟な評価を行います。</div>
        </div>

        <div style={{borderTop:"1px solid #F1F3F6",paddingTop:"14px"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"14px"}}>
            <div>
              <div style={{fontSize:"10px",fontWeight:600,color:"#A09888",letterSpacing:"0.5px",marginBottom:"8px"}}>対応行為類型（検知対象）</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"5px"}}>
                {["暴力行為","暴言・侮辱","威嚇・脅迫","人格否定・差別","土下座要求","長時間拘束","過剰要求","不当要求","SNS晒し","セクハラ","ストーキング","器物破損"].map((t,i)=>(<span key={i} style={{fontSize:"11px",padding:"3px 9px",borderRadius:"4px",background:"#FAF7F2",color:"#5A4F42",border:"1px solid #E0D9CE",fontWeight:500}}>{t}</span>))}
              </div>
            </div>
            <div>
              <div style={{fontSize:"10px",fontWeight:600,color:"#A09888",letterSpacing:"0.5px",marginBottom:"8px"}}>セキュリティ・運用</div>
              {[["データ保存","暗号化ローカルストレージ"],["通信","HTTPS/TLS暗号化通信"],["個人情報","マイナンバー等は黒塗り対応"],["書類保存義務","完了年度から5年間保存（jGrants）"],["アクセス制御","管理者/ユーザー ロール分離"]].map(([k,v],i)=>(<div key={i} style={{display:"flex",fontSize:"11.5px",lineHeight:1.4,marginBottom:"4px",gap:"4px"}}><span style={{color:"#8C7E6A",flexShrink:0,minWidth:"95px"}}>{k}</span><span style={{color:"#2C2418",fontWeight:500}}>{v}</span></div>))}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>);
}

function AffiliatePage({ user }) {
  const [refs,setRefs]=useState([]);const [copied,setCopied]=useState(false);
  useEffect(()=>{(async()=>{setRefs((await Storage.get("affiliate_referrals")||[]).filter(r=>r.refCode===user.userId));})();},[user.userId]);
  const affUrl=`${window.location.origin}${window.location.pathname}?ref=${user.userId}`;
  const copyUrl=()=>{navigator.clipboard?.writeText(affUrl).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);}).catch(()=>{});};
  const confirmedRefs=refs.filter(r=>r.status==="confirmed");const pendingRefs=refs.filter(r=>r.status==="pending");const totalReward=confirmedRefs.length*10000;
  return (<div style={{padding:"32px",animation:"fadeIn 0.3s ease"}}>

    <div style={{background:"linear-gradient(135deg,#FF8C42 0%,#FF6B6B 40%,#EE5A9A 100%)",borderRadius:"14px",padding:"36px 32px",marginBottom:"20px",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:"-30px",right:"-20px",width:"180px",height:"180px",background:"rgba(255,255,255,0.1)",borderRadius:"50%"}}/>
      <div style={{position:"absolute",bottom:"-40px",left:"40%",width:"120px",height:"120px",background:"rgba(255,255,255,0.08)",borderRadius:"50%"}}/>
      <div style={{position:"absolute",top:"20px",right:"40px",fontSize:"64px",opacity:0.15}}>🎁</div>
      <div style={{position:"relative",zIndex:1}}>
        <div style={{fontSize:"12px",color:"rgba(255,255,255,0.8)",fontWeight:600,letterSpacing:"2px",marginBottom:"6px"}}>REFERRAL PROGRAM</div>
        <div style={{fontSize:"22px",fontWeight:700,color:"#FFF",lineHeight:1.4,marginBottom:"6px"}}>トーカスAI ご紹介制度</div>
        <div style={{fontSize:"16px",color:"rgba(255,255,255,0.85)",lineHeight:1.8}}>簡単！ URLを送って契約してもらうだけで…</div>
        <div style={{display:"inline-block",background:"rgba(255,255,255,0.2)",backdropFilter:"blur(8px)",borderRadius:"10px",padding:"14px 22px",marginTop:"14px"}}>
          <div style={{fontSize:"16px",color:"rgba(255,255,255,0.8)",marginBottom:"2px"}}>1件あたりの紹介報酬</div>
          <div style={{fontSize:"34px",fontWeight:800,color:"#FFF",fontFamily:"'Inter',sans-serif",letterSpacing:"-1px"}}>¥10,000<span style={{fontSize:"14px",fontWeight:500,marginLeft:"4px"}}>/ 件</span></div>
        </div>
      </div>
    </div>

    <div style={{background:"linear-gradient(135deg,#FFF7ED,#FFF1F2)",border:"1px solid #FECACA",borderRadius:"10px",padding:"22px 24px",marginBottom:"16px"}}>
      <div style={{fontSize:"16px",fontWeight:700,color:"#E11D48",marginBottom:"10px",textAlign:"center"}}>みんなにうれしい制度を広めて、報酬もいただいちゃおう！</div>
      <div style={{fontSize:"13px",color:"#5A4F42",lineHeight:2,textAlign:"center"}}>
        あなたの紹介URLから新規のお申し込み → ご契約成立で<strong style={{color:"#E11D48"}}> ¥10,000 </strong>の報酬をお支払い！<br/>
        報酬は決済確認後、<strong style={{color:"#0F172A"}}>末締め・翌月15日</strong>にお振込みいたします。<br/>
        紹介人数に上限はありません。たくさん広めるほどお得です。
      </div>
    </div>

    <div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"10px"}}>ご紹介の流れ</div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"10px",marginBottom:"18px"}}>
      {[["1","URLをシェア","下の紹介URLをコピーして知り合いの事業者様に送るだけ！メール・LINE・SNS何でもOK","#FF8C42"],["2","お申し込み・ご契約","URLから新規申し込み → 管理者が承認 → ご契約成立で紹介確定！","#FF6B6B"],["3","報酬お支払い","決済確認後、末締め翌月15日にご登録口座へ ¥10,000 をお振込み","#EE5A9A"]].map(([n,title,desc,color])=>(
        <div key={n} style={{background:"#FFF",border:"1px solid #FEE2E2",borderRadius:"10px",padding:"18px",textAlign:"center"}}>
          <div style={{width:"38px",height:"38px",borderRadius:"50%",background:color,color:"#FFF",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:"16px",fontFamily:"'Inter',sans-serif",margin:"0 auto 10px",boxShadow:`0 4px 12px ${color}40`}}>{n}</div>
          <div style={{fontSize:"12px",fontWeight:600,color:"#2C2418",marginBottom:"4px"}}>{title}</div>
          <div style={{fontSize:"12px",color:"#8C7E6A",lineHeight:1.6}}>{desc}</div>
        </div>
      ))}
    </div>

    <div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"10px"}}>紹介メッセージ テンプレート</div>
    <div style={{fontSize:"14px",color:"#8C7E6A",marginBottom:"10px"}}>そのままコピーして LINE・メール・SNS で送れます。タップするとURLも一緒にコピーされます。</div>
    {[
      {tag:"カジュアル",emoji:"💬",msg:"40万円もらえる東京都の奨励金制度って知ってる？カスハラ対策するだけで申請できて、数万円のAIサポートで書類作成から申請まで全部やってくれるみたい！\n\n詳しくはここから見てみて👇"},
      {tag:"ビジネス向け",emoji:"📩",msg:"お世話になっております。東京都のカスハラ対策奨励金（40万円）をご存知でしょうか？\n\n「トーカスAI」というAIサポートアプリを使えば、対策マニュアルの自動生成から申請書類の作成まで、低コストでワンストップ対応できます。\n\n東京都内の中小企業様であれば対象になる可能性が高いので、ぜひご確認ください。"},
      {tag:"飲食・小売向け",emoji:"🏪",msg:"うちも使い始めたんだけど、カスハラ対策するだけで東京都から40万円もらえる制度があるよ！\n\nAIが判定してくれるし、面倒な書類も自動で作ってくれるから、店舗運営しながらでも全然いける。月額も安いし、奨励金でお釣りくるよ👍"},
      {tag:"士業・コンサル紹介",emoji:"📋",msg:"顧問先へのご案内にいかがでしょうか。東京都カスハラ防止条例に対応した奨励金制度（40万円支給）があり、「トーカスAI」を使えば対策マニュアル・基本方針・申請書類をAIで一括生成できます。\n\n取組②（AIシステム導入）に該当するため、導入＝申請要件を満たします。"},
      {tag:"友達にサクッと",emoji:"🎉",msg:"ねえこれすごくない？東京都がカスハラ対策した会社に40万くれるって！しかもこのアプリ使えばAIが全部やってくれるから超ラク。都内で会社やってる人みんな対象っぽいよ〜"},
    ].map((t,i)=>{
      const [msgCopied,setMsgCopied]=[false,()=>{}];
      const fullMsg=t.msg+"\n\n"+affUrl;
      return(<div key={i} style={{background:"#FFF",border:"1px solid #FEE2E2",borderRadius:"10px",padding:"16px",marginBottom:"8px",position:"relative"}}>
        <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"8px"}}>
          <span style={{fontSize:"13px"}}>{t.emoji}</span>
          <span style={{fontSize:"13px",fontWeight:600,padding:"3px 10px",borderRadius:"5px",background:"linear-gradient(135deg,#FFF7ED,#FFF1F2)",color:"#E11D48",border:"1px solid #FECDD3"}}>{t.tag}</span>
        </div>
        <div style={{fontSize:"13px",color:"#3D3629",lineHeight:1.8,whiteSpace:"pre-wrap",background:"#FAFBFC",borderRadius:"7px",padding:"12px 14px",border:"1px solid #F1F3F6",marginBottom:"8px"}}>{t.msg}<div style={{marginTop:"8px",fontSize:"13px",color:"#E11D48",wordBreak:"break-all"}}>{affUrl}</div></div>
        <button onClick={()=>{navigator.clipboard?.writeText(fullMsg).then(()=>{const btn=document.getElementById("cpbtn"+i);if(btn){btn.textContent="✓ コピーしました！";btn.style.background="#10B981";setTimeout(()=>{btn.textContent="この文章をコピー";btn.style.background="linear-gradient(135deg,#FF8C42,#FF6B6B)";},2000);}});}} id={"cpbtn"+i} style={{padding:"7px 16px",fontSize:"13px",fontWeight:600,background:"linear-gradient(135deg,#FF8C42,#FF6B6B)",color:"#FFF",border:"none",borderRadius:"6px",cursor:"pointer",fontFamily:"'Zen Kaku Gothic New','Noto Sans JP',sans-serif",boxShadow:"0 2px 8px rgba(255,107,107,0.2)"}}>この文章をコピー</button>
      </div>);
    })}

    <div style={{...S.card,border:"1px solid #FECDD3",background:"linear-gradient(135deg,#FFF5F5,#FFF)",marginTop:"14px"}}>
      <div style={{fontSize:"14px",fontWeight:700,color:"#E11D48",marginBottom:"10px"}}>あなたの紹介URL</div>
      <div style={{display:"flex",gap:"6px",alignItems:"center",marginBottom:"6px"}}>
        <input readOnly value={affUrl} style={{...S.input,flex:1,fontSize:"12px",fontFamily:"'Inter','Noto Sans JP',monospace",background:"#FFF",color:"#E11D48",border:"1px solid #FECDD3"}} onClick={e=>e.target.select()}/>
        <button style={{padding:"9px 18px",fontSize:"13px",fontWeight:700,background:"linear-gradient(135deg,#FF8C42,#FF6B6B)",color:"#FFF",border:"none",borderRadius:"8px",cursor:"pointer",fontFamily:"'Zen Kaku Gothic New','Noto Sans JP',sans-serif",whiteSpace:"nowrap",boxShadow:"0 3px 12px rgba(255,107,107,0.3)"}} onClick={copyUrl}>{copied?"✓ コピー済み!":"URLをコピー"}</button>
      </div>
      <div style={{fontSize:"11px",color:"#F43F5E"}}>あなたの紹介コード: <strong>{user.userId}</strong></div>
    </div>

    <div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginTop:"18px",marginBottom:"10px"}}>成果レポート</div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"10px",marginBottom:"14px"}}>
      <div style={{background:"linear-gradient(135deg,#FFF1F2,#FFF)",border:"1px solid #FECDD3",borderRadius:"10px",padding:"16px",textAlign:"center"}}><div style={{fontSize:"11px",color:"#8C7E6A",marginBottom:"4px"}}>紹介数（承認済）</div><div style={{fontSize:"18px",fontWeight:700,color:"#E11D48",fontFamily:"'Inter',sans-serif"}}>{confirmedRefs.length}</div><div style={{fontSize:"11px",color:"#FB7185"}}>件</div></div>
      <div style={{background:"linear-gradient(135deg,#FFF7ED,#FFF)",border:"1px solid #FED7AA",borderRadius:"10px",padding:"16px",textAlign:"center"}}><div style={{fontSize:"11px",color:"#8C7E6A",marginBottom:"4px"}}>審査中</div><div style={{fontSize:"18px",fontWeight:700,color:"#EA580C",fontFamily:"'Inter',sans-serif"}}>{pendingRefs.length}</div><div style={{fontSize:"11px",color:"#F97316"}}>件</div></div>
      <div style={{background:"linear-gradient(135deg,#F0FDF4,#FFF)",border:"1px solid #BBF7D0",borderRadius:"10px",padding:"16px",textAlign:"center"}}><div style={{fontSize:"11px",color:"#8C7E6A",marginBottom:"4px"}}>累計報酬額</div><div style={{fontSize:"18px",fontWeight:700,color:"#15803D",fontFamily:"'Inter',sans-serif"}}>¥{totalReward.toLocaleString()}</div><div style={{fontSize:"11px",color:"#16A34A"}}>次回お支払い: 翌月15日</div></div>
    </div>

    {refs.length>0&&<div style={{...S.card,border:"1px solid #FECDD3"}}>
      <div style={{fontSize:"16px",fontWeight:700,color:"#E11D48",marginBottom:"8px"}}>紹介履歴</div>
      <div style={S.tableWrap}><table style={S.table}><thead><tr><th style={S.th}>企業名</th><th style={S.th}>申込日</th><th style={S.th}>ステータス</th><th style={S.th}>報酬</th></tr></thead>
      <tbody>{refs.map((r,i)=>(<tr key={i} style={S.tr}><td style={S.td}>{r.company}</td><td style={S.td}>{new Date(r.date).toLocaleDateString("ja-JP")}</td><td style={S.td}><span style={{...S.badge,background:r.status==="confirmed"?"#DCFCE7":"#FEF3C7",color:r.status==="confirmed"?"#15803D":"#92400E"}}>{r.status==="confirmed"?"確定":"審査中"}</span></td><td style={{...S.td,fontWeight:700,color:r.status==="confirmed"?"#15803D":"#94A3B8"}}>{r.status==="confirmed"?"¥10,000":"—"}</td></tr>))}</tbody></table></div>
    </div>}

    <div style={{background:"#FFF7ED",border:"1px solid #FED7AA",borderRadius:"8px",padding:"14px 16px",marginTop:"14px"}}>
      <div style={{fontSize:"16px",fontWeight:600,color:"#C2410C",marginBottom:"6px"}}>ご紹介制度のルール</div>
      <div style={{fontSize:"13px",color:"#8C7E6A",lineHeight:1.9}}>
        ・紹介URLからの新規お申し込み → ご契約成立が報酬発生の条件です<br/>
        ・報酬額: 1件あたり ¥10,000（税込）<br/>
        ・お支払い: 決済確認後、末締め翌月15日にお振込み<br/>
        ・紹介人数の上限はありません<br/>
        ・ご自身の申込は対象外です<br/>
        ・不正が確認された場合は報酬をお支払いできない場合があります
      </div>
    </div>
  </div>);
}

function GuidelinesPage() {
  const [sec,setSec]=useState("ordinance");
  const tabs=[{id:"ordinance",label:"条例概要"},{id:"definition",label:"定義・類型"},{id:"obligations",label:"事業者の義務"},{id:"subsidy",label:"奨励金制度"},{id:"resources",label:"参考リンク"}];
  const SecBox=({title,children,color="#1D4ED8"})=>(<div style={{background:"#FAF7F2",border:"1px solid #E0D9CE",borderLeft:`4px solid ${color}`,borderRadius:"4px",padding:"14px 16px",marginBottom:"10px"}}>{title&&<div style={{fontSize:"13px",fontWeight:700,color,marginBottom:"8px"}}>{title}</div>}{children}</div>);
  const Item=({children})=>(<div style={{fontSize:"13px",color:"#5A4F42",lineHeight:1.7,paddingLeft:"10px",borderLeft:"2px solid #E2E8F0",marginBottom:"5px"}}>{children}</div>);
  const Link=({href,children})=>(<div style={{fontSize:"13px",color:"#8B6914",marginBottom:"4px",lineHeight:1.6}}>{children}<br/><span style={{fontSize:"13px",color:"#8C7E6A",wordBreak:"break-all"}}>{href}</span></div>);

  return (<div style={{padding:"32px",animation:"fadeIn 0.3s ease"}}>
    <h2 style={S.pageTitle}>東京都カスハラガイドライン</h2>
    <p style={{fontSize:"14px",color:"#8C7E6A",marginBottom:"14px"}}>東京都カスタマー・ハラスメント防止条例および関連制度の詳細情報</p>
    <div style={{display:"flex",gap:"4px",marginBottom:"18px",flexWrap:"wrap"}}>{tabs.map(t=>(<button key={t.id} onClick={()=>setSec(t.id)} style={{padding:"6px 12px",fontSize:"13px",fontWeight:sec===t.id?700:500,background:sec===t.id?"#0F172A":"#FFF",color:sec===t.id?"#FFF":"#64748B",border:"1px solid "+(sec===t.id?"#0F172A":"#E2E8F0"),borderRadius:"4px",cursor:"pointer",fontFamily:"'Noto Sans JP','Inter',sans-serif"}}>{t.label}</button>))}</div>

    {sec==="ordinance"&&<div>
      <div style={S.card}>
        <div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"10px"}}>東京都カスタマー・ハラスメント防止条例</div>
        <div style={{fontSize:"13px",color:"#5A4F42",lineHeight:1.8,marginBottom:"12px"}}>令和6年（2024年）10月に成立。東京都内で事業を行う全ての事業者に対し、カスタマーハラスメントの防止に向けた措置を求めています。令和7年（2025年）4月1日施行。</div>
        <SecBox title="条例の目的" color="#1D4ED8">
          <Item>カスタマーハラスメントの防止に関し基本理念を定めること</Item>
          <Item>都、顧客等、就業者、事業者それぞれの責務を明らかにすること</Item>
          <Item>カスタマーハラスメントの防止に関する施策の基本的事項を定めること</Item>
          <Item>就業者の安全で快適な就業環境の確保・都民生活の向上に寄与すること</Item>
        </SecBox>
        <SecBox title="条例の基本的考え方" color="#047857">
          <Item>何人もカスタマーハラスメントを行ってはならない（禁止規定）</Item>
          <Item>罰則規定はないが、事業者に防止措置を義務付け</Item>
          <Item>顧客等の権利を不当に侵害しないよう留意</Item>
          <Item>他の法令との関係：既存のハラスメント防止法制との整合性確保</Item>
        </SecBox>
      </div>
    </div>}

    {sec==="definition"&&<div>
      <div style={S.card}>
        <div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"10px"}}>カスタマーハラスメントの定義と類型</div>
        <SecBox title="定義" color="#1D4ED8"><div style={{fontSize:"13px",color:"#8B6914",fontWeight:600,textAlign:"center",lineHeight:1.8}}>「顧客等から就業者に対し、その業務に関して行われる著しい迷惑行為であって、就業環境を害するもの」</div></SecBox>
        <div style={{fontSize:"13px",fontWeight:600,color:"#5A4F42",margin:"14px 0 8px"}}>「顧客等」の範囲:</div>
        <Item>商品やサービスを提供する顧客</Item>
        <Item>事業に相当な関係を有する人</Item>
        <Item>円滑な業務遂行にあたり対応が必要な人</Item>
        <div style={{fontSize:"13px",fontWeight:600,color:"#5A4F42",margin:"14px 0 8px"}}>「就業者」の範囲:</div>
        <Item>役員、正社員、嘱託社員、派遣社員</Item>
        <Item>業務委託先のスタッフも該当</Item>
        <div style={{fontSize:"13px",fontWeight:600,color:"#5A4F42",margin:"14px 0 8px"}}>著しい迷惑行為の類型:</div>
        {["暴力行為 — 物を投げる、叩く、押す、胸ぐらをつかむ等","暴言・侮辱・誹謗中傷 — 「馬鹿」「死ね」等の人格否定","威嚇・脅迫 — 「SNSに晒す」「訴える」等の恐怖を与える言動","人格否定・差別的発言 — 性別、年齢、国籍等に基づく差別","土下座の要求 — 強要罪（刑法223条）に該当しうる","長時間の拘束 — 同じ主張の繰り返し、堂々巡り","過剰な対応の強要 — 社会通念上相当な範囲を超える要求","不当・過剰な要求 — 不当に高額な賠償金請求等","SNS等への信用棄損投稿 — 従業員の個人情報や動画の公開","セクハラ・SOGIハラ — 性的言動、つきまとい行為"].map((t,i)=>(<SecBox key={i} color={i<3?"#B91C1C":i<6?"#B45309":"#6D28D9"}><div style={{fontSize:"13px",color:"#5A4F42"}}>{t}</div></SecBox>))}
        <SecBox title="「就業環境を害する」の判断基準" color="#0F172A">
          <Item>平均的な就業者が同様の状況で当該行為を受けた場合を基準</Item>
          <Item>社会一般の就業者が業務遂行上看過できない程度の支障が生じたと感じるか</Item>
          <Item>主観的な受け止めだけでなく客観的な判断が必要</Item>
        </SecBox>
      </div>
    </div>}

    {sec==="obligations"&&<div>
      <div style={S.card}>
        <div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"10px"}}>事業者の義務（条例に基づく措置）</div>
        <SecBox title="必須措置" color="#B91C1C">
          <Item>カスタマーハラスメントに対する基本方針の策定・周知（社内・社外）</Item>
          <Item>カスタマーハラスメント対策に関するマニュアルの作成</Item>
          <Item>マニュアルの社内周知</Item>
          <Item>相談窓口の設置</Item>
          <Item>従業員への研修の実施</Item>
          <Item>発生時の組織的対応体制の構築</Item>
          <Item>従業員のケア・メンタルヘルス対応</Item>
        </SecBox>
        <SecBox title="マニュアル必須項目（奨励金申請要件）" color="#1D4ED8">
          <Item>カスタマーハラスメントの定義</Item>
          <Item>カスタマーハラスメントに対する基本方針</Item>
          <Item>顧客対応の基本的な心構え</Item>
          <Item>クレームの初期対応</Item>
          <Item>カスタマーハラスメントの判断基準</Item>
          <Item>カスタマーハラスメントへの対応フロー</Item>
          <Item>行為別の具体的対応例</Item>
          <Item>警察との連携</Item>
          <Item>社内体制（相談窓口・再発防止）</Item>
        </SecBox>
        <SecBox title="企業間取引における義務" color="#047857">
          <Item>取引先企業の従業員に対するカスハラの禁止</Item>
          <Item>立場の弱い取引先への「無理な要求をしない・させない」配慮</Item>
          <Item>独占禁止法上の優越的地位の濫用に注意</Item>
        </SecBox>
        <SecBox title="障害者への合理的配慮（令和6年4月義務化）" color="#6D28D9">
          <Item>障害のある顧客等への不当な差別的取扱いの禁止</Item>
          <Item>合理的配慮の提供（過重な負担でない範囲）</Item>
          <Item>ただし「暴力や暴言に耐える必要はない」ことは当然</Item>
        </SecBox>
      </div>
    </div>}

    {sec==="subsidy"&&<div>
      <div style={S.card}>
        <div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"10px"}}>東京都カスハラ対策奨励金制度</div>
        <SecBox title="奨励金概要" color="#047857">
          <Item>奨励金額: 40万円（定額）</Item>
          <Item>対象: 都内で事業を行う中小企業等（法人・個人事業主）</Item>
          <Item>申請方法: jGrants（電子申請システム）経由</Item>
        </SecBox>
        <div style={{fontSize:"13px",fontWeight:600,color:"#5A4F42",margin:"14px 0 8px"}}>対象となる取組（2つ以上を実施）:</div>
        <SecBox title="取組① 録音・録画機器の整備" color="#1D4ED8">
          <Item>録音・録画機器の購入またはリース</Item>
          <Item>録音・録画環境の整備</Item>
          <Item>機器のパンフレット等の準備</Item>
          <Item>社外への周知</Item>
        </SecBox>
        <SecBox title="取組② AIを活用したシステム等の導入" color="#6D28D9">
          <Item>AIシステム等の導入時の領収書またはサービス契約</Item>
          <Item>AIシステム等のパンフレット等</Item>
          <Item>社内への周知</Item>
        </SecBox>
        <SecBox title="取組③ 外部人材の活用" color="#B45309">
          <Item>ア. 相談対応等の継続的な契約</Item>
          <Item>イ. 社内研修等のためのスポット契約</Item>
          <Item>ウ. 警備会社との法人契約</Item>
        </SecBox>
        <SecBox title="申請の注意事項" color="#B91C1C">
          <Item>提出書類は全て「写し」をA4縦のPDF形式で提出</Item>
          <Item>指定のファイル名で提出すること</Item>
          <Item>登記簿謄本・住民票は申請日時点で発行日から3か月以内</Item>
          <Item>不備や未提出書類がある場合は受付不可</Item>
          <Item>関係書類は事業完了から5年間保存義務あり</Item>
        </SecBox>
      </div>
    </div>}

    {sec==="resources"&&<div>
      <div style={S.card}>
        <div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"10px"}}>参考リンク・問い合わせ先</div>
        <div style={{fontSize:"13px",fontWeight:600,color:"#5A4F42",margin:"8px 0"}}>東京都 公式サイト:</div>
        <Link href="https://www.tokyo-cusharaboushi.jp/">カスハラ防止奨励金 公式サイト</Link>
        <Link href="https://www.tokyo-cusharaboushi.jp/requirements/">募集内容・対象</Link>
        <Link href="https://www.tokyo-cusharaboushi.jp/how-to-apply/">申請方法</Link>
        <Link href="https://www.tokyo-cusharaboushi.jp/faq/">よくある質問</Link>
        <div style={{fontSize:"13px",fontWeight:600,color:"#5A4F42",margin:"14px 0 8px"}}>東京都 関連サイト:</div>
        <Link href="https://www.customer-harassment-taisaku.metro.tokyo.lg.jp/">東京都カスハラ対策ポータル</Link>
        <Link href="https://www.nocushara.metro.tokyo.lg.jp/">NOカスハラ東京</Link>
        <div style={{fontSize:"13px",fontWeight:600,color:"#5A4F42",margin:"14px 0 8px"}}>申請システム:</div>
        <Link href="https://www.jgrants-portal.go.jp/">jGrants（補助金申請システム）</Link>
        <div style={{fontSize:"13px",fontWeight:600,color:"#5A4F42",margin:"14px 0 8px"}}>緊急連絡先:</div>
        <SecBox title="緊急連絡先" color="#B91C1C">
          {[["警察（緊急通報）","110番"],["警察相談専用","#9110"],["東京都カスハラ相談","0120-XXX-XXX"]].map(([n,t],i)=>(<div key={i} style={{fontSize:"13px",color:"#7F1D1D",marginBottom:"4px"}}><span style={{fontWeight:600}}>{n}:</span> <span style={{fontFamily:"'Inter',sans-serif",fontWeight:700}}>{t}</span></div>))}
        </SecBox>
      </div>
    </div>}
  </div>);
}

function ChecklistPage() {
  const [entityType,setEntityType]=useState("corp");
  const [checked,setChecked]=useState({});
  const toggle=(k)=>setChecked(p=>({...p,[k]:!p[k]}));
  const [selectedTorikumi,setSelectedTorikumi]=useState({t1:false,t2:false,t3a:false,t3b:false,t3c:false});
  const toggleT=(k)=>setSelectedTorikumi(p=>({...p,[k]:!p[k]}));

  const corpDocs=[
    {no:"1",name:"支給申請書（様式第１号）",file:"01_支給申請書（様式第１号）_企業名.pdf",note:"提出前に申請を行う取組のページまでそろっているか確認",example:"jGrantsからダウンロードした様式に記入・押印しPDF化"},
    {no:"2",name:"誓約書（様式第２号）",file:"02_誓約書（様式第２号）_企業名.pdf",note:"代表者の署名・押印が必要",example:"様式に代表者が署名・押印しスキャン"},
    {no:"3",name:"事業所一覧（様式第1号別紙）",file:"03_事業所一覧（様式第１号別紙）_企業名.pdf",note:"全事業所を記載",example:"都内事業所を全て記載しPDF化"},
    {no:"4",name:"会社案内または会社概要",file:"04_会社案内_企業名.pdf",note:"事業内容が分かるもの",example:"会社パンフレット・HPのスクリーンショット等"},
    {no:"5",name:"商業・法人登記簿謄本",file:"05_登記簿謄本_企業名.pdf",note:"申請日時点で発行日から3か月以内",example:"法務局で「履歴事項全部証明書」を取得"},
    {no:"7",name:"都内事業所の証明（本店が都外の場合）",file:"07_提出資料名_企業名.pdf",note:"本店が都外の場合のみ必要",example:"水道光熱費の領収書や賃貸借契約書のコピー"},
    {no:"8",name:"法人事業税納税証明書",file:"08_事業税_企業名.pdf",note:"非課税・0円の場合は8-2も提出",example:"都税事務所で取得"},
    {no:"8-2",name:"事業実態確認書類（8が0円/非課税の場合）",file:"08_事業実態確認書類_企業名.pdf",note:"事業税が0円または非課税の場合のみ",example:"事業活動を証明する書類（売上帳簿等）"},
    {no:"9",name:"法人都民税納税証明書",file:"09_都民税_企業名.pdf",note:"都税事務所で取得",example:"直近の納税証明書をPDF化"},
    {no:"10",name:"カスハラ対策マニュアル",file:"10_マニュアル_企業名.pdf",note:"必須項目を全て網羅すること（本システムで生成可能）",example:"本アプリ「対応マニュアル」タブでPDF生成"},
    {no:"11",name:"マニュアル社内周知の証明",file:"11_マニュアル周知_企業名.pdf",note:"社内メール・掲示・配布等の証拠",example:"社内メールのスクリーンショット、掲示板写真等"},
    {no:"12",name:"マニュアル必須項目対応表",file:"12_マニュアル対応表_企業名.pdf",note:"マニュアルが各必須項目に対応しているか一覧",example:"対応表様式に記入しPDF化"},
    {no:"13",name:"カスハラに対する基本方針",file:"13_基本方針_企業名.pdf",note:"社内外に掲示・公開するもの",example:"基本方針を策定し文書化"},
    {no:"14",name:"基本方針の社内・社外周知証明",file:"14_基本方針社内・社外周知_企業名.pdf",note:"社内掲示＋HP掲載等の両方が必要",example:"社内掲示写真＋HPスクリーンショット"},
  ];

  const indivDocs=[
    {no:"1",name:"支給申請書（様式第１号）",file:"01_支給申請書（様式第１号）_企業名.pdf",note:"取組のページまでそろっているか確認",example:"jGrantsからダウンロードした様式に記入"},
    {no:"2",name:"誓約書（様式第２号）",file:"02_誓約書（様式第２号）_企業名.pdf",note:"代表者の署名・押印",example:"様式に署名・押印しスキャン"},
    {no:"3",name:"事業所一覧（様式第1号別紙）",file:"03_事業所一覧（様式第１号別紙）_企業名.pdf",note:"全事業所を記載",example:"都内事業所を全て記載しPDF化"},
    {no:"4",name:"会社案内または会社概要",file:"04_会社案内_企業名.pdf",note:"事業内容が分かるもの",example:"パンフレット・HP印刷等"},
    {no:"5",name:"個人事業の開業・廃業届出書",file:"05_開廃業届_企業名.pdf",note:"税務署提出済みの控え",example:"開業届の控えをスキャン"},
    {no:"6",name:"代表者の住民票",file:"06_住民票_企業名.pdf",note:"申請日時点で発行日から3か月以内",example:"市区町村窓口で取得"},
    {no:"8",name:"個人事業税納税証明書",file:"08_事業税_企業名.pdf",note:"非課税の場合は8-2と8-3も提出",example:"都税事務所で取得"},
    {no:"9",name:"住民税納税証明書",file:"09_都民税_企業名.pdf",note:"居住地と事業所地が異なる場合は両方提出",example:"市区町村窓口で取得"},
    {no:"10",name:"カスハラ対策マニュアル",file:"10_マニュアル_企業名.pdf",note:"必須項目を全て網羅すること",example:"本アプリでPDF生成可能"},
    {no:"11",name:"マニュアル社内周知の証明",file:"11_マニュアル周知_企業名.pdf",note:"社内への周知証拠",example:"メール・掲示板写真等"},
    {no:"12",name:"マニュアル必須項目対応表",file:"12_マニュアル対応表_企業名.pdf",note:"各必須項目との対応一覧",example:"対応表様式に記入"},
    {no:"13",name:"基本方針",file:"13_基本方針_企業名.pdf",note:"策定・公開が必要",example:"基本方針文書を作成"},
    {no:"14",name:"基本方針の周知証明",file:"14_基本方針社内・社外周知_企業名.pdf",note:"社内＋社外の両方が必要",example:"掲示写真＋HP画面等"},
  ];

  const torikumiDocs={
    t1:[
      {name:"録音・録画機器の領収書/契約書",file:"15-1_録音録画領収書・契約書_企業名.pdf",note:"購入またはリースの証明",example:"領収書またはリース契約書のコピー"},
      {name:"録音・録画環境の整備状況が分かる書類",file:"15-2_録音録画整備状況_企業名.pdf",note:"設置場所・環境の説明",example:"設置写真・配置図等"},
      {name:"録音・録画機器のパンフレット等",file:"15-3_録音録画パンフ_企業名.pdf",note:"導入した機器の仕様",example:"メーカーのカタログ・仕様書"},
      {name:"社外周知が確認できる書類",file:"15-4_録音録画社外周知_企業名.pdf",note:"「録音録画しています」等の掲示",example:"店頭掲示物の写真（jpg/pngも可）"},
    ],
    t2:[
      {name:"AIシステム等の領収書/契約書",file:"15-1_AI領収書・契約書_企業名.pdf",note:"システム導入時の証明",example:"領収書またはサービス契約書のコピー"},
      {name:"AIシステム等のパンフレット等",file:"15-2_AIパンフ_企業名.pdf",note:"導入したシステムの説明",example:"サービスのパンフレット・画面キャプチャ等"},
      {name:"社内周知が確認できる書類",file:"15-3_AI社内周知_企業名.pdf",note:"システム導入の社内通知",example:"社内メール・掲示等のスクリーンショット"},
    ],
    t3a:[
      {name:"相談対応等に関する契約書",file:"15-1_継続契約書_企業名.pdf",note:"継続的な相談対応契約",example:"弁護士事務所等との顧問契約書"},
      {name:"外部人材活用の社内周知",file:"15-2継続契約社内周知_企業名.pdf",note:"社内への周知証拠",example:"「外部相談窓口を設置しました」等の通知"},
      {name:"外部人材の運用ルール",file:"15-3継続契約運用ルール_企業名.pdf",note:"利用方法・連絡先等を整理",example:"相談フロー図・利用ガイド等"},
    ],
    t3b:[
      {name:"スポット契約書",file:"15-1_スポット契約書_企業名.pdf",note:"研修等の単発契約",example:"研修講師との契約書"},
      {name:"研修実施の社内周知",file:"15-2_研修実施社内周知_企業名.pdf",note:"研修開催通知・実施報告",example:"研修案内メール・開催報告書"},
      {name:"研修配布資料等",file:"15-3_研修配布資料等_企業名.pdf",note:"実際に使用した資料",example:"研修テキスト・スライド等"},
    ],
    t3c:[
      {name:"警備会社との法人契約書",file:"15-1_警備会社契約書_企業名.pdf",note:"警備サービス契約",example:"警備会社との契約書コピー"},
      {name:"警備会社活用の社内周知",file:"15-2_警備会社活用周知_企業名.pdf",note:"社内への周知証拠",example:"「警備体制を導入しました」等の通知"},
      {name:"警備会社の運用ルール",file:"15-3_警備会社運用ルール_企業名.pdf",note:"運用方法の文書",example:"警備依頼フロー・緊急連絡先一覧等"},
    ],
  };

  const docs=entityType==="corp"?corpDocs:indivDocs;
  const checkedCount=docs.filter(d=>checked[d.no]).length;
  const activeT=Object.entries(selectedTorikumi).filter(([,v])=>v).map(([k])=>k);
  const allTorikumiDocs=activeT.flatMap(k=>torikumiDocs[k]||[]);
  const totalDocs=docs.length+allTorikumiDocs.length;
  const totalChecked=checkedCount+allTorikumiDocs.filter(d=>checked[`t_${d.file}`]).length;

  return (<div style={{padding:"32px",animation:"fadeIn 0.3s ease"}}>
    <h2 style={S.pageTitle}>申請チェックリスト</h2>
    <p style={{fontSize:"14px",color:"#8C7E6A",marginBottom:"14px"}}>東京都カスハラ対策奨励金 提出書類チェックシート（{entityType==="corp"?"法人":"個人事業主"}用）</p>
    <div style={{display:"flex",gap:"8px",marginBottom:"14px"}}>
      <button onClick={()=>{setEntityType("corp");setChecked({});}} style={{...S.secondaryBtn,...(entityType==="corp"?{background:"#0F172A",color:"#FFF",borderColor:"#0F172A"}:{})}}>法人用</button>
      <button onClick={()=>{setEntityType("indiv");setChecked({});}} style={{...S.secondaryBtn,...(entityType==="indiv"?{background:"#0F172A",color:"#FFF",borderColor:"#0F172A"}:{})}}>個人事業主用</button>
    </div>
    <div style={{...S.card,marginBottom:"12px",padding:"14px 16px"}}>
      <div style={{fontSize:"13px",fontWeight:600,color:"#0F172A",marginBottom:"8px"}}>進捗: {totalChecked} / {totalDocs} 書類</div>
      <div style={{height:"6px",background:"#F3F5F8",borderRadius:"3px"}}><div style={{height:"100%",width:`${totalDocs>0?(totalChecked/totalDocs)*100:0}%`,background:totalChecked===totalDocs?"#15803D":"#1D4ED8",borderRadius:"3px",transition:"width 0.3s"}}/></div>
    </div>

    <div style={{...S.card,marginBottom:"12px"}}>
      <div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"10px"}}>基本書類</div>
      {docs.map(d=>(<div key={d.no} style={{borderBottom:"1px solid #F1F5F9",padding:"10px 0"}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:"10px"}}>
          <input type="checkbox" checked={!!checked[d.no]} onChange={()=>toggle(d.no)} style={{marginTop:"3px",accentColor:"#1D4ED8"}}/>
          <div style={{flex:1}}>
            <div style={{fontSize:"13px",fontWeight:600,color:checked[d.no]?"#15803D":"#0F172A"}}>{d.no}. {d.name}</div>
            <div style={{fontSize:"13px",color:"#8B6914",fontFamily:"'Inter','Noto Sans JP',sans-serif",marginTop:"2px"}}>{d.file}</div>
            <div style={{fontSize:"13px",color:"#B45309",marginTop:"3px"}}>補足: {d.note}</div>
            <div style={{fontSize:"13px",color:"#8C7E6A",marginTop:"2px"}}>添付例: {d.example}</div>
          </div>
        </div>
      </div>))}
    </div>

    <div style={{...S.card,marginBottom:"12px"}}>
      <div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"10px"}}>実施した取組を選択</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:"6px",marginBottom:"10px"}}>
        {[["t1","取組① 録音・録画"],["t2","取組② AIシステム"],["t3a","取組③ア 相談等"],["t3b","取組③イ 研修等"],["t3c","取組③ウ 警備等"]].map(([k,label])=>(<button key={k} onClick={()=>toggleT(k)} style={{padding:"6px 12px",fontSize:"13px",fontWeight:selectedTorikumi[k]?700:500,background:selectedTorikumi[k]?"#0F172A":"#FFF",color:selectedTorikumi[k]?"#FFF":"#64748B",border:"1px solid "+(selectedTorikumi[k]?"#0F172A":"#E2E8F0"),borderRadius:"4px",cursor:"pointer",fontFamily:"'Noto Sans JP','Inter',sans-serif"}}>{label}</button>))}
      </div>
      <div style={{fontSize:"13px",color:"#B91C1C",marginBottom:"10px"}}>※奨励金申請には上記取組から2つ以上の実施が必要です</div>
      {activeT.map(k=>(<div key={k} style={{marginBottom:"12px"}}>
        <div style={{fontSize:"13px",fontWeight:700,color:"#6D28D9",marginBottom:"6px",padding:"4px 0",borderBottom:"1px solid #EDE9FE"}}>
          {k==="t1"?"取組① 録音・録画機器の整備":k==="t2"?"取組② AIシステム等の導入":k==="t3a"?"取組③ア 相談対応等の継続契約":k==="t3b"?"取組③イ 社内研修等のスポット契約":"取組③ウ 警備会社との法人契約"}
        </div>
        {(torikumiDocs[k]||[]).map((d,i)=>(<div key={i} style={{borderBottom:"1px solid #F1F5F9",padding:"8px 0"}}>
          <div style={{display:"flex",alignItems:"flex-start",gap:"10px"}}>
            <input type="checkbox" checked={!!checked[`t_${d.file}`]} onChange={()=>toggle(`t_${d.file}`)} style={{marginTop:"3px",accentColor:"#6D28D9"}}/>
            <div style={{flex:1}}>
              <div style={{fontSize:"13px",fontWeight:600,color:checked[`t_${d.file}`]?"#15803D":"#0F172A"}}>{d.name}</div>
              <div style={{fontSize:"13px",color:"#6D28D9",fontFamily:"'Inter','Noto Sans JP',sans-serif",marginTop:"2px"}}>{d.file}</div>
              <div style={{fontSize:"13px",color:"#B45309",marginTop:"3px"}}>補足: {d.note}</div>
              <div style={{fontSize:"13px",color:"#8C7E6A",marginTop:"2px"}}>添付例: {d.example}</div>
            </div>
          </div>
        </div>))}
      </div>))}
    </div>
    <div style={{fontSize:"13px",color:"#8C7E6A",lineHeight:1.7}}>※本チェックシートは提出不要です。申請前のセルフチェックにご活用ください。<br/>※提出書類は全て「写し」をA4縦のPDF形式で提出してください。<br/>※掲示物や機器の写真はjpg/png形式も可。</div>
  </div>);
}


function AIJudgment({ user, onIncidentSaved }) {
  const [description,setDescription]=useState("");const [type,setType]=useState("");
  const [checkedCriteria,setCheckedCriteria]=useState({});const [isAnalyzing,setIsAnalyzing]=useState(false);
  const [result,setResult]=useState(null);const [isRecording,setIsRecording]=useState(false);
  const [usageCount,setUsageCount]=useState(0);const [uploadedFiles,setUploadedFiles]=useState([]);
  const recognitionRef=useRef(null);const fileInputRef=useRef(null);const audioInputRef=useRef(null);

  useEffect(()=>{(async()=>{const u=await Storage.get("ai_usage")||{};setUsageCount(u[`${user.userId}_${new Date().toISOString().slice(0,7)}`]||0);})();},[user.userId]);
  const toggleCriteria=(c,i)=>setCheckedCriteria(p=>({...p,[`${c}_${i}`]:!p[`${c}_${i}`]}));

  const toggleRecording=()=>{
    if(isRecording){recognitionRef.current?.stop();setIsRecording(false);return;}
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){alert("音声入力非対応（Chrome推奨）");return;}
    const r=new SR();r.lang="ja-JP";r.continuous=true;r.interimResults=true;
    r.onresult=(e)=>{let t="";for(let i=e.resultIndex;i<e.results.length;i++)t+=e.results[i][0].transcript;setDescription(p=>p+t);};
    r.onerror=()=>setIsRecording(false);r.onend=()=>setIsRecording(false);
    recognitionRef.current=r;r.start();setIsRecording(true);
  };

  const handleTextFile=(e)=>{Array.from(e.target.files).forEach(f=>{const r=new FileReader();r.onload=(ev)=>{setDescription(p=>(p?p+"\n\n":"")+"【"+f.name+"】\n"+ev.target.result);setUploadedFiles(p=>[...p,{name:f.name,type:"text",size:f.size}]);};r.readAsText(f,"UTF-8");});e.target.value="";};
  const handleAudioFile=(e)=>{Array.from(e.target.files).forEach(f=>{setUploadedFiles(p=>[...p,{name:f.name,type:"audio",size:f.size}]);setDescription(p=>(p?p+"\n\n":"")+`【音声ファイル: ${f.name}】\n音声ファイルが添付されました。内容を文字起こしして追記するか、状況説明と合わせてAI判定を実行してください。`);});e.target.value="";};

  const analyze=async()=>{
    if(!description.trim()){alert("状況を入力してください");return;}
    if(usageCount>=MONTHLY_AI_LIMIT){alert(`月間上限(${MONTHLY_AI_LIMIT}回)到達`);return;}
    setIsAnalyzing(true);setResult(null);
    const checked=Object.entries(checkedCriteria).filter(([,v])=>v).map(([k])=>{const[c,i]=k.split("_");return KASUHARA_CRITERIA[c]?.items[parseInt(i)];}).filter(Boolean);
    const prompt=`あなたはカスタマーハラスメント判定の専門AIです。東京都カスタマー・ハラスメント防止条例に基づき判定してください。\n\n【状況説明】\n${description}\n\n${type?`【行為類型】${type}\n`:""}${checked.length>0?`【チェック済み基準】\n${checked.map(i=>`・${i}`).join("\n")}\n`:""}以下のJSON形式のみで回答:\n{"severity":0-100,"isKasuhara":true/false,"summary":"50字以内","analysis":"200字以内","recommendation":"150字以内","legalRisk":"100字以内","responseFlow":"100字以内"}`;
    try{
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:API_MODEL,max_tokens:1000,messages:[{role:"user",content:prompt}]})});
      const data=await res.json();const text=data.content?.map(i=>i.text||"").join("")||"";
      const parsed=JSON.parse(text.replace(/```json|```/g,"").trim());setResult(parsed);
      await Storage.set("incidents",[...(await Storage.get("incidents")||[]),{date:new Date().toISOString(),reporter:user.name,reporterId:user.userId,type:type||"未分類",description,severity:parsed.severity,summary:parsed.summary,aiJudgment:true,aiResult:parsed,checkedCriteria:checked,attachedFiles:uploadedFiles}]);
      const usage=await Storage.get("ai_usage")||{};const mk=`${user.userId}_${new Date().toISOString().slice(0,7)}`;usage[mk]=(usage[mk]||0)+1;await Storage.set("ai_usage",usage);setUsageCount(usage[mk]);
      onIncidentSaved();
    }catch(err){console.error(err);const cnt=Object.values(checkedCriteria).filter(Boolean).length;const bs=Math.min(cnt*15,100);setResult({severity:bs,isKasuhara:bs>=40,summary:bs>=40?"カスハラ可能性あり":"通常クレーム範囲",analysis:"AI接続不可。簡易判定。",recommendation:bs>=60?"組織対応に移行。":"通常対応。",legalRisk:"AI接続が必要。",responseFlow:"一次→上位者報告→組織対応"});}
    finally{setIsAnalyzing(false);}
  };

  const resetForm=()=>{setDescription("");setType("");setCheckedCriteria({});setResult(null);setUploadedFiles([]);};

  return (
    <div style={{padding:"32px",animation:"fadeIn 0.3s ease"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"20px"}}><h2 style={S.pageTitle}>AI カスハラ判定</h2><div style={{fontSize:"12px",color:"#8C7E6A"}}>月間使用: <strong style={{color:usageCount>=MONTHLY_AI_LIMIT?"#B91C1C":"#1D4ED8"}}>{usageCount}</strong> / {MONTHLY_AI_LIMIT}回</div></div>

      {!result?(<>
        <div style={S.card}>
          <div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"14px",borderBottom:"1px solid #E8ECF0",paddingBottom:"8px"}}>状況入力</div>
          <div style={S.inputGroup}><label style={S.label}>行為類型</label><select style={S.select} value={type} onChange={e=>setType(e.target.value)}><option value="">選択してください</option>{MEIWAKU_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
          <div style={S.inputGroup}><label style={S.label}>状況の詳細</label><textarea style={S.textarea} value={description} onChange={e=>setDescription(e.target.value)} placeholder={"顧客の言動、状況、時間経過などを記載\n音声入力 / テキスト読込 / 音声ファイル添付に対応"} rows={6}/></div>

          <div style={{display:"flex",gap:"8px",flexWrap:"wrap",marginBottom:"10px"}}>
            <button style={{...S.uploadBtn,background:isRecording?"#B91C1C":"#0F172A",color:"#FFF",borderColor:isRecording?"#B91C1C":"#0F172A"}} onClick={toggleRecording}>{isRecording?"■ 録音停止":"● 音声入力"}</button>
            <button style={S.uploadBtn} onClick={()=>fileInputRef.current?.click()}>テキスト / メール読込</button>
            <button style={S.uploadBtn} onClick={()=>audioInputRef.current?.click()}>音声ファイル添付</button>
            <input ref={fileInputRef} type="file" accept=".txt,.csv,.eml,.msg,.html,.htm,.md,.log,.json,.xml" multiple style={{display:"none"}} onChange={handleTextFile}/>
            <input ref={audioInputRef} type="file" accept=".mp3,.wav,.m4a,.ogg,.webm,.flac,.aac,.wma" multiple style={{display:"none"}} onChange={handleAudioFile}/>
          </div>
          {isRecording&&<div style={{fontSize:"13px",color:"#B91C1C",marginBottom:"8px",display:"flex",alignItems:"center",gap:"6px"}}><span style={{width:"8px",height:"8px",borderRadius:"50%",background:"#B91C1C",animation:"rec 1s infinite"}}/>音声認識中</div>}
          {uploadedFiles.length>0&&<div style={{marginBottom:"8px"}}><div style={{fontSize:"13px",fontWeight:600,color:"#8C7E6A",marginBottom:"4px"}}>添付ファイル</div>{uploadedFiles.map((f,i)=>(<span key={i} style={{display:"inline-flex",alignItems:"center",gap:"4px",padding:"3px 8px",background:"#F3F5F8",borderRadius:"4px",fontSize:"13px",color:"#5A4F42",marginRight:"4px",marginBottom:"3px"}}><span style={{fontWeight:600,color:f.type==="audio"?"#6D28D9":"#1D4ED8"}}>{f.type==="audio"?"AUDIO":"TEXT"}</span>{f.name}<button style={{background:"none",border:"none",color:"#A09888",cursor:"pointer",fontSize:"13px"}} onClick={()=>setUploadedFiles(p=>p.filter((_,j)=>j!==i))}>×</button></span>))}</div>}
        </div>

        <div style={{...S.card,marginTop:"14px"}}>
          <div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"14px",borderBottom:"1px solid #E8ECF0",paddingBottom:"8px"}}>判断基準チェックリスト（東京都マニュアル準拠）</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"14px"}}>{Object.entries(KASUHARA_CRITERIA).map(([key,cat])=>(<div key={key}><div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"6px",padding:"5px 8px",background:"#F3F5F8",borderRadius:"4px"}}>{cat.label}</div>{cat.items.map((item,i)=>(<label key={i} style={{display:"flex",gap:"6px",padding:"4px 0",cursor:"pointer",alignItems:"flex-start"}}><input type="checkbox" checked={!!checkedCriteria[`${key}_${i}`]} onChange={()=>toggleCriteria(key,i)} style={{marginTop:"2px",accentColor:"#1D4ED8"}}/><span style={{fontSize:"13px",color:"#5A4F42",lineHeight:1.4}}>{item}</span></label>))}</div>))}</div>
        </div>

        <button style={{...S.primaryBtn,width:"100%",padding:"14px",fontSize:"13px",marginTop:"14px",justifyContent:"center"}} onClick={analyze} disabled={isAnalyzing}>
          {isAnalyzing?<span style={{display:"flex",alignItems:"center",gap:"8px",justifyContent:"center"}}><span style={{width:"16px",height:"16px",border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"#FFF",borderRadius:"50%",animation:"spin 1s linear infinite"}}/>AI分析中...</span>:"AI判定を実行"}
        </button>
      </>):(
        <div>
          <div style={{...S.card,borderLeft:`4px solid ${getSeverityColor(result.severity).bg}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div><div style={{fontSize:"13px",color:"#8C7E6A",fontWeight:500,letterSpacing:"0.3px"}}>カスハラ判定結果</div><div style={{fontSize:"18px",fontWeight:800,color:getSeverityColor(result.severity).bg,fontFamily:"'Inter',sans-serif"}}>深刻度 {result.severity}%</div></div>
              <span style={{...S.badge,background:result.isKasuhara?"#B91C1C":"#15803D",color:"#FFF",fontSize:"13px",padding:"8px 16px"}}>{result.isKasuhara?"カスハラ該当":"非該当"}</span>
            </div>
            <div style={{marginTop:"12px",height:"8px",background:"#F3F5F8",borderRadius:"4px",overflow:"hidden"}}><div style={{height:"100%",width:`${result.severity}%`,background:"linear-gradient(90deg,#15803D 0%,#B45309 50%,#B91C1C 100%)",borderRadius:"4px",transition:"width 1s ease"}}/></div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:"13px",color:"#A09888",marginTop:"3px"}}><span>正常</span><span>低</span><span>中</span><span>高</span><span>危険</span></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"14px",marginTop:"14px"}}>
            {[{t:"要約",c:"#1D4ED8",v:result.summary},{t:"詳細分析",c:"#6D28D9",v:result.analysis},{t:"推奨対応",c:"#047857",v:result.recommendation},{t:"法的リスク",c:"#B91C1C",v:result.legalRisk}].map((x,i)=>(<div key={i} style={{...S.card,borderLeft:`3px solid ${x.c}`}}><div style={{fontSize:"13px",fontWeight:700,color:x.c,marginBottom:"6px",letterSpacing:"0.2px"}}>{x.t}</div><p style={{fontSize:"13px",color:"#3D3629",lineHeight:1.7}}>{x.v}</p></div>))}
          </div>
          <div style={{...S.card,marginTop:"14px",borderLeft:"3px solid #C2410C"}}><div style={{fontSize:"16px",fontWeight:700,color:"#C2410C",marginBottom:"6px"}}>対応フロー</div><p style={{fontSize:"13px",color:"#3D3629",lineHeight:1.7}}>{result.responseFlow}</p></div>

          <div style={{display:"flex",gap:"8px",marginTop:"14px"}}>
            <button style={{...S.primaryBtn,flex:1,padding:"14px",justifyContent:"center"}} onClick={()=>{
              const sev=getSeverityColor(result.severity);const now=new Date();
              const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>カスハラ判定報告書</title><style>@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap');body{font-family:'Noto Sans JP',sans-serif;padding:44px 52px;font-size:13px;color:#333;line-height:1.8;max-width:780px;margin:0 auto}h1{font-size:20px;text-align:center;border-bottom:3px solid #0F172A;padding-bottom:8px;margin-bottom:16px}table{width:100%;border-collapse:collapse;margin:10px 0}th{background:#0F172A;color:#FFF;padding:6px 10px;text-align:left;font-size:12px;width:140px;vertical-align:top}td{padding:6px 10px;border:1px solid #E2E8F0;font-size:12px;vertical-align:top;white-space:pre-wrap}.sev{display:inline-block;padding:4px 12px;border-radius:4px;font-weight:700;font-size:14px;color:#FFF}.box{background:#F8FAFC;border:1px solid #E2E8F0;border-left:4px solid #1D4ED8;padding:10px 14px;margin:8px 0;border-radius:3px}.warn{border-left-color:#B91C1C}@media print{body{padding:20px 30px}}</style></head><body>
<div style="text-align:right;font-size:12px;color:#B91C1C;font-weight:700;margin-bottom:8px">社外秘</div>
<h1>カスタマーハラスメント 判定報告書</h1>
<table><tr><th>報告日時</th><td>${now.toLocaleString("ja-JP")}</td></tr><tr><th>報告者</th><td>${user.name}（${user.department||""}）</td></tr><tr><th>行為類型</th><td>${type||"未分類"}</td></tr></table>
<h2 style="font-size:15px;border-left:4px solid #1D4ED8;padding-left:10px;margin:20px 0 8px">1. 判定結果</h2>
<table><tr><th>カスハラ判定</th><td><span class="sev" style="background:${result.isKasuhara?"#B91C1C":"#15803D"}">${result.isKasuhara?"カスハラ該当":"非該当"}</span></td></tr><tr><th>深刻度</th><td><span class="sev" style="background:${sev.bg}">${result.severity}% — ${sev.label}</span></td></tr><tr><th>要約</th><td style="font-weight:700">${result.summary}</td></tr></table>
<h2 style="font-size:15px;border-left:4px solid #6D28D9;padding-left:10px;margin:20px 0 8px">2. 詳細分析</h2>
<div class="box">${result.analysis}</div>
<h2 style="font-size:15px;border-left:4px solid #047857;padding-left:10px;margin:20px 0 8px">3. 推奨対応</h2>
<div class="box" style="border-left-color:#047857">${result.recommendation}</div>
<h2 style="font-size:15px;border-left:4px solid #B91C1C;padding-left:10px;margin:20px 0 8px">4. 法的リスク</h2>
<div class="box warn">${result.legalRisk}</div>
<h2 style="font-size:15px;border-left:4px solid #C2410C;padding-left:10px;margin:20px 0 8px">5. 対応フロー</h2>
<div class="box" style="border-left-color:#C2410C">${result.responseFlow}</div>
<h2 style="font-size:15px;border-left:4px solid #0F172A;padding-left:10px;margin:20px 0 8px">6. 状況詳細（入力内容）</h2>
<div class="box" style="border-left-color:#0F172A;white-space:pre-wrap;font-size:12px">${description.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>
${Object.values(checkedCriteria).some(Boolean)?`<h2 style="font-size:15px;border-left:4px solid #0F172A;padding-left:10px;margin:20px 0 8px">7. チェック済み判断基準</h2><ul style="padding-left:18px">${Object.entries(checkedCriteria).filter(([,v])=>v).map(([k])=>{const[c,i]=k.split("_");return `<li>${KASUHARA_CRITERIA[c]?.items[parseInt(i)]||k}</li>`;}).join("")}</ul>`:""}
<table style="margin-top:24px"><tr><th>報告者署名</th><td style="height:44px"></td></tr><tr><th>監督者確認</th><td style="height:44px"></td></tr><tr><th>対応完了日</th><td style="height:44px"></td></tr></table>
<p style="font-size:11px;color:#B91C1C;margin-top:16px">※本報告書は社外秘として厳重に管理します。AI判定結果は参考情報であり、最終判断は現場監督者が行ってください。</p>
</body></html>`;
              const w=window.open("","_blank");if(!w){alert("ポップアップを許可してください");return;}w.document.write(html);w.document.close();w.print();
            }}>報告書を作成（PDF出力）</button>
            <button style={{...S.ghostBtn,flex:1,padding:"14px",justifyContent:"center"}} onClick={resetForm}>新しい判定を行う</button>
          </div>
        </div>
      )}
    </div>
  );
}

function UserHistory({ incidents }) {
  return (<div style={{padding:"32px",animation:"fadeIn 0.3s ease"}}><h2 style={S.pageTitle}>判定記録一覧</h2>
    {incidents.length===0?<div style={{...S.card,...S.emptyState}}>記録なし</div>:[...incidents].reverse().map((inc,i)=>{const sev=getSeverityColor(inc.severity);return(<div key={i} style={{...S.card,marginBottom:"8px",borderLeft:`3px solid ${sev.bg}`}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:"13px",color:"#A09888"}}>{new Date(inc.date).toLocaleString("ja-JP")}</div><div style={{fontSize:"13px",fontWeight:600,color:"#0F172A",marginTop:"2px"}}>{inc.type}</div></div><span style={{...S.badge,background:sev.bg,color:sev.text,fontSize:"13px",padding:"4px 10px"}}>{inc.severity}%</span></div>{inc.summary&&<p style={{fontSize:"13px",color:"#5A4F42",marginTop:"5px"}}>{inc.summary}</p>}</div>);})}
  </div>);
}

function ResponseManual() {
  const [sec,setSec]=useState("overview");
  const [reportForm,setReportForm]=useState({date:"",time:"",place:"",reporter:"",dept:"",customer:"",contact:"",type:[],detail:"",demand:"",response:"",evidence:[],judgment:"",severity:"",action:"",plan:""});
  const [company,setCompany]=useState({name:"",rep:"",dept:"",phone:"",email:"",ext_name:"",ext_phone:"",ext_email:"",survey_date:"",limit_min:"30",limit_count:"3",limit_exit:"2"});
  const tabs=[{id:"overview",label:"概要・方針"},{id:"initial",label:"初期対応"},{id:"criteria",label:"判断基準"},{id:"flow",label:"対応フロー"},{id:"cases",label:"行為別対応"},{id:"police",label:"警察連携"},{id:"support",label:"社内体制"},{id:"report",label:"報告書作成"},{id:"pdf",label:"PDF生成"}];

  const downloadReport=()=>{
    const f=reportForm;const types=f.type.join("、")||"未選択";const evs=f.evidence.join("、")||"なし";
    const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>カスハラ インシデント報告書</title><style>body{font-family:'Noto Sans JP','Hiragino Kaku Gothic Pro',sans-serif;padding:40px;font-size:14px;color:#333}h1{text-align:center;font-size:20px;border-bottom:3px solid #0F172A;padding-bottom:10px;margin-bottom:24px}table{width:100%;border-collapse:collapse;margin-bottom:20px}th{background:#EFF6FF;text-align:left;padding:10px 12px;border:1px solid #CBD5E1;font-weight:700;width:160px;color:#1D4ED8;vertical-align:top}td{padding:10px 12px;border:1px solid #CBD5E1;min-height:32px;vertical-align:top;white-space:pre-wrap}.footer{margin-top:24px;font-size:12px;color:#B91C1C}@media print{body{padding:20px}}</style></head><body><h1>カスタマーハラスメント インシデント報告書</h1><table><tr><th>発生日時</th><td>${f.date} ${f.time}</td></tr><tr><th>発生場所</th><td>${f.place}</td></tr><tr><th>対応者氏名</th><td>${f.reporter}</td></tr><tr><th>対応者所属</th><td>${f.dept}</td></tr><tr><th>顧客氏名</th><td>${f.customer}</td></tr><tr><th>顧客連絡先</th><td>${f.contact}</td></tr><tr><th>行為類型</th><td>${types}</td></tr><tr><th>状況詳細</th><td>${f.detail}</td></tr><tr><th>顧客の要求内容</th><td>${f.demand}</td></tr><tr><th>対応経過</th><td>${f.response}</td></tr><tr><th>証拠・記録</th><td>${evs}</td></tr><tr><th>カスハラ判定</th><td>${f.judgment||"未判定"}</td></tr><tr><th>深刻度</th><td>${f.severity||"未選択"}</td></tr><tr><th>実施した対応</th><td>${f.action}</td></tr><tr><th>今後の対応方針</th><td>${f.plan}</td></tr></table><table><tr><th>報告者署名</th><td style="height:48px"></td></tr><tr><th>監督者確認</th><td style="height:48px"></td></tr></table><p class="footer">※本報告書は社外秘として厳重に管理します。報告による不利益な取扱いは一切ありません。</p></body></html>`;
    const blob=new Blob([html],{type:"text/html;charset=utf-8"});const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download=`カスハラ報告書_${f.date||"未記入"}.html`;a.click();URL.revokeObjectURL(url);
  };

  const downloadManual=()=>{
    const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>カスタマーハラスメント対策マニュアル</title><style>body{font-family:'Noto Sans JP',sans-serif;padding:48px;max-width:800px;margin:0 auto;font-size:14px;color:#333;line-height:1.8}h1{font-size:24px;color:#0F172A;border-bottom:3px solid #0F172A;padding-bottom:8px}h2{font-size:18px;color:#0F172A;border-left:4px solid #1D4ED8;padding-left:12px;margin-top:32px}h3{font-size:15px;color:#334155;margin-top:20px}.box{background:#F8FAFC;border:1px solid #E2E8F0;border-left:4px solid #1D4ED8;padding:16px;margin:12px 0;border-radius:4px}.warn{background:#FEF2F2;border-color:#FECACA;border-left-color:#B91C1C}table{width:100%;border-collapse:collapse;margin:12px 0}th{background:#0F172A;color:#FFF;padding:8px 12px;text-align:left;font-size:13px}td{padding:8px 12px;border:1px solid #E2E8F0;font-size:13px}tr:nth-child(even) td{background:#F8FAFC}.step{display:flex;margin:8px 0;gap:12px}.step-n{background:#0F172A;color:#FFF;width:32px;height:32px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0}.step-c{flex:1;background:#F1F5F9;padding:12px;border-radius:4px}ul{padding-left:20px}li{margin-bottom:4px}@media print{body{padding:20px;font-size:12px}}</style></head><body>
<h1>カスタマーハラスメント対策マニュアル</h1><p style="color:#64748B">東京都カスタマー・ハラスメント防止条例準拠</p>
<h2>1. カスタマーハラスメントの定義</h2><div class="box"><strong>「顧客等から従業員に対して行われる著しい迷惑行為であって、従業員の就業環境を害するもの」</strong></div><p>著しい迷惑行為の例:</p><ul><li>暴力行為</li><li>暴言・侮辱・誹謗中傷</li><li>威嚇・脅迫</li><li>人格否定・差別的発言</li><li>土下座の要求</li><li>長時間の拘束</li><li>過剰な対応の強要</li><li>不当・過剰な要求</li><li>SNS等への信用棄損投稿</li><li>セクハラ・SOGIハラ・つきまとい</li></ul>
<h2>2. 基本方針</h2><div class="box"><ul><li>お客様のご意見・ご要望に真摯に対応します</li><li>カスハラに該当する行為には従業員を守るため毅然と対応します</li><li>被害を受けた従業員のケアを最優先します</li><li>相談窓口の設置・警察・弁護士等との連携体制を整備します</li><li>悪質な場合は対応打ち切り・サービス提供をお断りする場合があります</li></ul></div>
<h2>3. 初期対応</h2><div class="step"><div class="step-n">1</div><div class="step-c"><strong>顧客に寄り添う</strong> — 正当な要求は真摯に受け止め、傾聴する</div></div><div class="step"><div class="step-n">2</div><div class="step-c"><strong>要求内容を特定</strong> — 要求を明確にし議論を限定する</div></div><div class="step"><div class="step-n">3</div><div class="step-c"><strong>事実確認</strong> — 5W1Hで正確に確認。確認前は限定的謝罪にとどめる</div></div><div class="step"><div class="step-n">4</div><div class="step-c"><strong>複数人対応</strong> — 原則複数人で。役割分担（応対・記録）を明確に</div></div><div class="step"><div class="step-n">5</div><div class="step-c"><strong>場所選定</strong> — オープンスペースで対応。会議室は密室にしない</div></div><div class="step"><div class="step-n">6</div><div class="step-c"><strong>記録</strong> — 詳細に記録し、会話を録音する</div></div>
<h2>4. 判断基準</h2><table><tr><th>判断項目</th><th>チェックポイント</th></tr><tr><td><strong>要求態様</strong></td><td>暴言・暴力・脅迫・無断撮影等</td></tr><tr><td><strong>要求内容</strong></td><td>不当な金品・土下座・書面謝罪・解雇要求等</td></tr><tr><td><strong>時間・回数</strong></td><td>30分超継続・退去命令2回以上不服従・要求3回以上反復・時間外苦情</td></tr></table>
<h2>5. 対応フロー</h2><div class="step"><div class="step-n">1</div><div class="step-c"><strong>一次対応（現場従業員）</strong> — 行為中止を求め、組織的対応に移行。監督者に報告</div></div><div class="step"><div class="step-n">2</div><div class="step-c"><strong>二次対応（監督者）</strong> — 対応を代わり安全確保。組織としての回答を伝達</div></div><div class="step"><div class="step-n">3</div><div class="step-c"><strong>警告・退去命令</strong> — 30分目安で中止。暴力の兆候は即退去命令</div></div><div class="step"><div class="step-n">4</div><div class="step-c"><strong>警察連携</strong> — 退去不服従・暴力は警察通報（110番 / #9110）</div></div>
<h2>6. 行為別対応</h2><table><tr><th>行為</th><th>対応</th></tr><tr><td>暴言</td><td>冷静に対応。繰り返す場合は打ち切り。録音・記録を残す</td></tr><tr><td>執拗な要求</td><td>対応不可を明確に。30分超で警察相談を伝える</td></tr><tr><td>土下座要求</td><td>「そのような対応はできません」と明確に拒否</td></tr><tr><td>暴行</td><td>刑法208条該当。即座に警察通報。複数人で対応</td></tr><tr><td>高圧的言動</td><td>曖昧な発言を避け安易な妥協をしない</td></tr><tr><td>長時間拘束</td><td>30分超で打ち切り（電話を切る）</td></tr><tr><td>セクハラ</td><td>不快である旨を明確に伝え、改めない場合はサービス打ち切り</td></tr></table>
<h2>7. 緊急連絡先</h2><table><tr><th>連絡先</th><th>電話番号</th><th>用途</th></tr><tr><td>警察（緊急）</td><td style="color:#B91C1C;font-weight:700">110</td><td>暴力等の緊急時</td></tr><tr><td>警察相談</td><td style="color:#B91C1C;font-weight:700">#9110</td><td>緊急性のない相談</td></tr><tr><td>社内相談窓口</td><td>○○-○○-○○</td><td>カスハラ全般</td></tr><tr><td>社外窓口（弁護士）</td><td>○○-○○-○○</td><td>法的対応</td></tr></table>
<div class="box warn"><strong>※本マニュアルは社外秘です。</strong> 定期的に見直しを行い、最新の状態を維持してください。</div></body></html>`;
    const blob=new Blob([html],{type:"text/html;charset=utf-8"});const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download="カスハラ対策マニュアル.html";a.click();URL.revokeObjectURL(url);
  };

  const toggleType=(t)=>setReportForm(p=>({...p,type:p.type.includes(t)?p.type.filter(x=>x!==t):[...p.type,t]}));
  const toggleEvidence=(e)=>setReportForm(p=>({...p,evidence:p.evidence.includes(e)?p.evidence.filter(x=>x!==e):[...p.evidence,e]}));
  const RF=({label,children})=>(<div style={{marginBottom:"12px"}}><label style={S.label}>{label}</label>{children}</div>);

  const SecBox=({title,children,color="#1D4ED8"})=>(<div style={{background:"#FAF7F2",border:"1px solid #E0D9CE",borderLeft:`4px solid ${color}`,borderRadius:"4px",padding:"14px 16px",marginBottom:"10px"}}>{title&&<div style={{fontSize:"13px",fontWeight:700,color,marginBottom:"8px"}}>{title}</div>}{children}</div>);
  const Step=({n,title,desc})=>(<div style={{display:"flex",gap:"10px",marginBottom:"8px"}}><div style={{width:"30px",height:"30px",background:"#0F172A",color:"#FFF",borderRadius:"4px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"13px",fontWeight:700,flexShrink:0,fontFamily:"'Inter',sans-serif"}}>{n}</div><div style={{flex:1,background:"#F3F5F8",padding:"10px 14px",borderRadius:"4px"}}><div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"3px"}}>{title}</div><div style={{fontSize:"13px",color:"#5A4F42",lineHeight:1.7}}>{desc}</div></div></div>);
  const Item=({children})=>(<div style={{fontSize:"13px",color:"#5A4F42",lineHeight:1.7,paddingLeft:"10px",borderLeft:"2px solid #E2E8F0",marginBottom:"5px"}}>{children}</div>);

  return (<div style={{padding:"32px",animation:"fadeIn 0.3s ease"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"18px"}}>
      <div><h2 style={S.pageTitle}>対応マニュアル</h2><p style={{fontSize:"13px",color:"#8C7E6A",margin:0}}>東京都カスタマー・ハラスメント防止条例準拠 — 全8章</p></div>
      <button style={S.primaryBtn} onClick={downloadManual}>マニュアルDL</button>
    </div>
    <div style={{display:"flex",gap:"4px",marginBottom:"18px",flexWrap:"wrap"}}>{tabs.map(t=>(<button key={t.id} onClick={()=>setSec(t.id)} style={{padding:"6px 12px",fontSize:"13px",fontWeight:sec===t.id?700:500,background:sec===t.id?"#0F172A":"#FFF",color:sec===t.id?"#FFF":"#64748B",border:"1px solid "+(sec===t.id?"#0F172A":"#E2E8F0"),borderRadius:"4px",cursor:"pointer",fontFamily:"'Noto Sans JP','Inter',sans-serif"}}>{t.label}</button>))}</div>

    {sec==="overview"&&<div>
      <div style={S.card}>
        <div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"10px"}}>カスタマーハラスメントの定義</div>
        <SecBox color="#1D4ED8"><div style={{fontSize:"13px",color:"#8B6914",fontWeight:600,textAlign:"center",lineHeight:1.8}}>「顧客等から従業員に対して行われる著しい迷惑行為であって、<br/>従業員の就業環境を害するもの」</div></SecBox>
        <div style={{fontSize:"13px",fontWeight:600,color:"#5A4F42",margin:"14px 0 8px"}}>著しい迷惑行為の例:</div>
        {["暴力行為","暴言・侮辱・誹謗中傷","威嚇・脅迫","人格否定・差別的発言","土下座の要求","長時間の拘束","過剰な対応の強要","不当・過剰な要求","SNS等への信用棄損投稿","セクハラ・SOGIハラ・つきまとい行為"].map((t,i)=>(<Item key={i}>{t}</Item>))}
      </div>
      <div style={{...S.card,marginTop:"12px"}}>
        <div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"10px"}}>基本方針</div>
        {["お客様のご意見・ご要望に真摯に対応します","カスハラ該当行為には従業員を守るため毅然とした対応を行います","被害を受けた従業員のケアを最優先します","カスハラに関する知識・対処方法の研修を実施します","相談窓口の設置・警察・弁護士等との連携体制を整備します","カスハラと判断した場合、対応打ち切り・サービス提供をお断りする場合があります","悪質な場合は警察や外部専門家と連携し毅然と対応します"].map((t,i)=>(<div key={i} style={{fontSize:"13px",color:"#5A4F42",lineHeight:1.8,padding:"3px 0 3px 14px",borderLeft:"2px solid #1D4ED8",marginBottom:"6px"}}>{`${i+1}. ${t}`}</div>))}
      </div>
    </div>}

    {sec==="initial"&&<div>
      <div style={S.card}>
        <div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"6px"}}>クレーム初期対応</div>
        <div style={{fontSize:"14px",color:"#8C7E6A",marginBottom:"14px"}}>カスハラを未然に防止するため、初期段階で以下のとおり対応します。クレームの全てがカスハラではありません。正当なクレームは業務改善の貴重な機会です。</div>
        <Step n="1" title="顧客に寄り添う" desc="正当な要求は真摯に受け止める。傾聴し、寄り添いながら主張を正確に聞き取る。"/>
        <Step n="2" title="要求内容を特定する" desc="要求内容を明確に特定し議論を限定する。電話の場合は氏名・連絡先を確認し、要求内容を復唱して特定する。"/>
        <Step n="3" title="事実関係を確認する（5W1H）" desc="いつ/どこで/誰が/何を/なぜ/どのように — で正確な事実関係を確認。確認前は限定的な謝罪（例:「ご不快な思いをおかけし申し訳ありません」）にとどめる。"/>
        <Step n="4" title="複数人で対応する" desc="組織対応を明確にするため原則複数人で対応。役割分担（応対・記録等）を定める。訪問の場合も複数人で。単独行動を取らない。"/>
        <Step n="5" title="対応場所を選定する" desc="原則オープンスペースで対応。会議室の場合:密室にしない/出入口側に着席/管理権の範囲内の場所を選定。"/>
        <Step n="6" title="対応内容を記録・情報共有する" desc="対応内容を可能な限り詳細に記録する。会話を録音する（事前承諾が望ましいが同意なしでも直ちに違法ではない）。速やかに部署内で情報共有。"/>
      </div>
      <SecBox title="心構え 5つのポイント" color="#047857">
        {[["傾聴する","相手の気持ちを理解し、背景（ストレス・不安等）を推し測る"],["誠実に対応","第一印象が重要。表情・言葉遣いに注意。クレーマー扱いしない"],["共感を伝える","「なるほど」「よくわかります」等あいづちを活用する"],["限定的な謝罪","責任不明の段階では対象を限定した謝罪を活用する"],["対応者を代わる","怒りが収まらない場合は躊躇せず別の担当者・上位者に代わる"]].map(([t,d],i)=>(<div key={i} style={{marginBottom:"8px"}}><span style={{fontSize:"13px",fontWeight:700,color:"#047857"}}>{t}</span><span style={{fontSize:"13px",color:"#5A4F42"}}> — {d}</span></div>))}
      </SecBox>
    </div>}

    {sec==="criteria"&&<div>
      <div style={S.card}>
        <div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"6px"}}>カスハラ判断基準</div>
        <div style={{fontSize:"14px",color:"#8C7E6A",marginBottom:"14px"}}>以下の3つの観点で判断します。これらは絶対的な基準ではなく、機械的な運用とならないよう留意が必要です。</div>
        {[{cat:"要求態様",color:"#B91C1C",items:["侮辱的な暴言、差別的・性的な言動、暴力や脅迫を伴う苦情","恐怖心を与える口調、大声、個人を攻撃する意図がある要求","従業員の顔等を無断で撮影し、SNS等で公開する行為"]},
          {cat:"要求内容",color:"#B45309",items:["不当な金品の要求","土下座での謝罪の要求","書面での謝罪の要求","従業員の解雇の要求","社会通念上相当な範囲を超える対応の強要"]},
          {cat:"時間・回数・頻度",color:"#8B6914",items:["著しい迷惑行為が30分を超えて継続","退去命令を2回以上したにも関わらず居座り続けている","対応不可の要求が3回以上繰り返されている","業務時間外（早朝・深夜）に苦情の電話がある"]}
        ].map((g,i)=>(<SecBox key={i} title={g.cat} color={g.color}>{g.items.map((t,j)=>(<Item key={j}>{t}</Item>))}</SecBox>))}
      </div>
    </div>}

    {sec==="flow"&&<div>
      <div style={S.card}>
        <div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"6px"}}>カスハラ対応フロー</div>
        <div style={{fontSize:"14px",color:"#8C7E6A",marginBottom:"14px"}}>真摯に対応しても迷惑行為が収まらない場合、組織的な対応に移行します。</div>
        <Step n="1" title="一次対応（現場従業員）" desc="行為の中止を求める。複数人対応・記録（録音含む）に移行。カスハラの可能性がある場合、現場監督者に報告し方針を相談する。"/>
        <Step n="2" title="二次対応（現場監督者）" desc="一次対応者から報告を受け、顧客からも聞き取り。カスハラ該当と判断した場合、対応を代わり安全確保。「組織としての回答」「説明を尽くしたこと」「これ以上の議論はできないこと」を伝達。"/>
        <Step n="3" title="警告・退去の命令" desc="膠着状態が30分を目安に対応を中止し伝達。暴力の兆候がある場合はその時点で退去命令。退去しない場合は最終警告の上、警察通報を検討。"/>
        <Step n="4" title="警察との連携" desc="退去命令に従わない場合、警察に通報。暴力・器物破損等の身の危険がある場合は即座に110番通報。"/>
      </div>
      <div style={{...S.card,marginTop:"12px",background:"#FEF2F2",border:"1px solid #FECACA"}}>
        <div style={{fontSize:"13px",fontWeight:700,color:"#B91C1C",marginBottom:"8px"}}>緊急連絡先</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px"}}>
          {[["警察（緊急通報）","110番"],["警察相談専用","#9110"],["社内相談窓口","○○-○○-○○"],["産業医","○○-○○-○○"]].map(([n,t],i)=>(<div key={i} style={{fontSize:"13px",color:"#7F1D1D"}}><span style={{fontWeight:600}}>{n}:</span> <span style={{fontFamily:"'Inter',sans-serif",fontWeight:700}}>{t}</span></div>))}
        </div>
      </div>
    </div>}

    {sec==="cases"&&<div>
      <div style={S.card}>
        <div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"14px"}}>行為別 具体的対応例</div>
        {[{type:"暴言",color:"#B91C1C",items:["暴言で返すことなく丁寧な言葉を用い冷静・沈着に対応する","怒声を発する場合、冷静に発言するよう注意を促す","不用意な発言を避け、発言は必要最小限にとどめる","迷惑行為であることを明確に伝え、対応できない旨を伝える","暴言が繰り返される場合、対応を打ち切る","録音・録画・対応記録を残し事後に検証できるようにする"]},
          {type:"執拗な要求",color:"#C2410C",items:["同じ要求が繰り返された場合、早い段階で対応不可を明確に伝える","30分超過で警察に相談する旨を明確に伝える","聞き入れない場合、監督者から最終退去要求をする","なお聞き入れない場合、監督者から警察に通報する"]},
          {type:"土下座の要求",color:"#B45309",items:["（例）「そのような対応はできません」と丁寧かつ明確に拒否","（例）「これ以上お客様とはお話できません」と伝える","録音・録画・対応記録を残す","聞き入れない場合、監督者から最終退去命令"]},
          {type:"暴行",color:"#B91C1C",items:["刑法第208条の暴行罪に該当 — 監督者判断を待たず即座に警察通報","監督者を含め複数人で対応する","録音・録画・対応記録を証拠として残す"]},
          {type:"高圧的な言動",color:"#6D28D9",items:["曖昧・ぶれた発言を避け、安易な妥協をしない","誤った発言は速やかに明確に訂正する","一方的な強弁・不当要求には事実関係が不明なまま認めない"]},
          {type:"長時間の拘束",color:"#8B6914",items:["堂々巡りが続いた場合、対応を打ち切る旨を伝える","30分超過で要求に応じられない旨を伝え打ち切る（電話を切る）"]},
          {type:"セクシャルハラスメント",color:"#BE185D",items:["性的な言動で不快になった旨を明確に伝える","セクハラの意識がない場合は具体例を示し言動しないよう伝える","言動を改めない場合、サービス提供の打ち切りを伝え監督者に報告"]}
        ].map((g,i)=>(<SecBox key={i} title={g.type} color={g.color}>{g.items.map((t,j)=>(<Item key={j}>{t}</Item>))}</SecBox>))}
      </div>
    </div>}

    {sec==="police"&&<div>
      <div style={S.card}>
        <div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"6px"}}>警察との連携手順</div>
        <div style={{fontSize:"14px",color:"#8C7E6A",marginBottom:"14px"}}>違法性のある迷惑行為は刑法等に抵触します。暴力・器物破損等で身の危険を感じた場合は即座に通報します。</div>
        <Step n="1" title="対応の中止を伝える" desc="従業員の心理的負担や周囲への影響を考慮し、対応の中止を顧客に伝える。中止は監督者を含めた複数名で判断する。"/>
        <Step n="2" title="行為の中止を求める" desc="迷惑行為を止めるよう顧客に伝える。2〜3度繰り返す。"/>
        <Step n="3" title="退去を命令する" desc="迷惑行為を止めない場合、施設管理権に基づき退去を命じる。2〜3度繰り返す。"/>
        <Step n="4" title="警察に通報する" desc="繰り返し退去を命じても退去しない場合、最終警告する。なお退去しない場合、警察に通報する。"/>
        <Step n="5" title="警察官に状況を説明する" desc="警察官到着後、状況を説明し録画・録音がある場合は確認してもらう。退去させたい旨を明確に伝える。相手が立ち去った場合も再訪の恐れがあれば情報連携する。"/>
      </div>
      <SecBox title="110番通報のポイント" color="#B91C1C">
        {["何があったか","通報の何分前のことか","場所（住所・目標となる建物・階数等）","被害や目撃の状況、けが人の有無","犯人の情報（性別・人数・年齢・服装・逃走方向等）"].map((t,i)=>(<Item key={i}>{t}</Item>))}
      </SecBox>
    </div>}

    {sec==="support"&&<div>
      <div style={S.card}>
        <div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"10px"}}>社内体制</div>
        <SecBox title="相談窓口" color="#1D4ED8">
          <div style={{fontSize:"13px",color:"#5A4F42",lineHeight:1.8}}>
            <div style={{marginBottom:"8px"}}><span style={{fontWeight:600}}>【社内】</span>本社 ○○部○○課　担当: ○○、○○<br/>電話: ○○-○○-○○ / メール: ○○@○○</div>
            <div><span style={{fontWeight:600}}>【社外】</span>○○弁護士事務所　担当: ○○弁護士<br/>電話: ○○-○○-○○ / メール: ○○@○○</div>
          </div>
        </SecBox>
        <div style={{fontSize:"13px",fontWeight:600,color:"#5A4F42",margin:"14px 0 8px"}}>相談対応の手順:</div>
        {["事実関係を聞き取り確認する（二次被害に配慮）","証拠（メモ・写真・録音等）があれば内容を確認","客観的証拠に基づきカスハラ該当か判断","該当する場合 → 対応中止・警察通報等を指示","該当しない場合 → 通常クレーム対応を指示","緊急性がある場合 → 監督者が対応を代わり従業員を引き離す"].map((t,i)=>(<Item key={i}>{t}</Item>))}
        <div style={{fontSize:"13px",fontWeight:600,color:"#5A4F42",margin:"14px 0 8px"}}>相談対応者の留意事項:</div>
        {["初期対応が重要、適切・迅速に対応する","プライバシー保護・不利益取扱いしない旨を伝える","心身の状況に配慮し、詰問にならないよう丁寧に聞く","メンタルヘルス不調の兆候 → 産業医等の専門家に依頼","セクハラ事案 → 相談者の希望に応じ同性の対応者が対応"].map((t,i)=>(<Item key={i}>{t}</Item>))}
      </div>
      <div style={{...S.card,marginTop:"12px"}}>
        <div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"10px"}}>再発防止の取組</div>
        {["従業員への注意喚起メッセージの発信 — カスハラは従業員の責任ではないこと、報告で人事評価が下がることはないことを明示","実際の事例を検証し、マニュアル改定・研修の見直しに反映","プライバシーに配慮しつつ社内会議で情報共有","定期的な研修の実施（社内研修＋社外セミナー）","社内アンケート等を参考に定期的な取組の見直し"].map((t,i)=>(<div key={i} style={{fontSize:"13px",color:"#5A4F42",lineHeight:1.7,padding:"6px 0 6px 14px",borderLeft:"2px solid #047857",marginBottom:"6px"}}>{t}</div>))}
      </div>
    </div>}

    {sec==="report"&&<div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"12px"}}><div style={{fontSize:"16px",fontWeight:600,color:"#2C2418"}}>インシデント報告書</div><button style={S.primaryBtn} onClick={downloadReport}>報告書DL</button></div>
      <div style={S.formCard}>
        <div style={S.formGrid}>
          <RF label="発生日"><input type="date" style={S.input} value={reportForm.date} onChange={e=>setReportForm(p=>({...p,date:e.target.value}))}/></RF>
          <RF label="発生時刻"><input type="time" style={S.input} value={reportForm.time} onChange={e=>setReportForm(p=>({...p,time:e.target.value}))}/></RF>
        </div>
        <RF label="発生場所"><input style={S.input} placeholder="例: 1F レジカウンター前" value={reportForm.place} onChange={e=>setReportForm(p=>({...p,place:e.target.value}))}/></RF>
        <div style={S.formGrid}>
          <RF label="対応者氏名"><input style={S.input} value={reportForm.reporter} onChange={e=>setReportForm(p=>({...p,reporter:e.target.value}))}/></RF>
          <RF label="対応者所属"><input style={S.input} value={reportForm.dept} onChange={e=>setReportForm(p=>({...p,dept:e.target.value}))}/></RF>
        </div>
        <div style={S.formGrid}>
          <RF label="顧客氏名（不明可）"><input style={S.input} value={reportForm.customer} onChange={e=>setReportForm(p=>({...p,customer:e.target.value}))}/></RF>
          <RF label="顧客連絡先"><input style={S.input} value={reportForm.contact} onChange={e=>setReportForm(p=>({...p,contact:e.target.value}))}/></RF>
        </div>
        <RF label="行為類型（複数選択可）"><div style={{display:"flex",flexWrap:"wrap",gap:"6px"}}>{MEIWAKU_TYPES.map(t=>(<button key={t} onClick={()=>toggleType(t)} style={{padding:"4px 10px",fontSize:"13px",fontWeight:reportForm.type.includes(t)?600:400,background:reportForm.type.includes(t)?"#0F172A":"#FFF",color:reportForm.type.includes(t)?"#FFF":"#64748B",border:"1px solid "+(reportForm.type.includes(t)?"#0F172A":"#E2E8F0"),borderRadius:"3px",cursor:"pointer",fontFamily:"'Noto Sans JP',sans-serif"}}>{t}</button>))}</div></RF>
        <RF label="状況詳細（5W1H: いつ/どこで/誰が/何を/なぜ/どのように）"><textarea style={{...S.textarea,minHeight:"100px"}} value={reportForm.detail} onChange={e=>setReportForm(p=>({...p,detail:e.target.value}))}/></RF>
        <RF label="顧客の要求内容"><textarea style={{...S.textarea,minHeight:"60px"}} value={reportForm.demand} onChange={e=>setReportForm(p=>({...p,demand:e.target.value}))}/></RF>
        <RF label="対応経過"><textarea style={{...S.textarea,minHeight:"80px"}} value={reportForm.response} onChange={e=>setReportForm(p=>({...p,response:e.target.value}))}/></RF>
        <RF label="証拠・記録（複数選択可）"><div style={{display:"flex",flexWrap:"wrap",gap:"6px"}}>{["録音あり","録画あり","メモあり","写真あり","メール/SNSあり"].map(e=>(<button key={e} onClick={()=>toggleEvidence(e)} style={{padding:"4px 10px",fontSize:"13px",fontWeight:reportForm.evidence.includes(e)?600:400,background:reportForm.evidence.includes(e)?"#1D4ED8":"#FFF",color:reportForm.evidence.includes(e)?"#FFF":"#64748B",border:"1px solid "+(reportForm.evidence.includes(e)?"#1D4ED8":"#E2E8F0"),borderRadius:"3px",cursor:"pointer",fontFamily:"'Noto Sans JP',sans-serif"}}>{e}</button>))}</div></RF>
        <div style={S.formGrid}>
          <RF label="カスハラ判定"><select style={S.select} value={reportForm.judgment} onChange={e=>setReportForm(p=>({...p,judgment:e.target.value}))}><option value="">選択してください</option><option>カスハラに該当する</option><option>カスハラに該当しない</option><option>判断保留</option></select></RF>
          <RF label="深刻度"><select style={S.select} value={reportForm.severity} onChange={e=>setReportForm(p=>({...p,severity:e.target.value}))}><option value="">選択してください</option><option>危険（即時対応必要）</option><option>高（組織対応必要）</option><option>中（注意して対応）</option><option>低（通常クレーム）</option></select></RF>
        </div>
        <RF label="実施した対応"><textarea style={{...S.textarea,minHeight:"60px"}} value={reportForm.action} onChange={e=>setReportForm(p=>({...p,action:e.target.value}))}/></RF>
        <RF label="今後の対応方針"><textarea style={{...S.textarea,minHeight:"60px"}} value={reportForm.plan} onChange={e=>setReportForm(p=>({...p,plan:e.target.value}))}/></RF>
      </div>
      <div style={{fontSize:"13px",color:"#B91C1C",lineHeight:1.7}}>※本報告書は社外秘として厳重に管理します。報告による不利益な取扱いは一切ありません。</div>
    </div>}

    {sec==="pdf"&&<div>
      <div style={S.card}>
        <div style={{fontSize:"14px",fontWeight:600,color:"#2C2418",marginBottom:"6px"}}>マニュアルPDF生成</div>
        <div style={{fontSize:"14px",color:"#8C7E6A",marginBottom:"14px"}}>会社情報を入力すると、完成版マニュアルをPDFとしてダウンロードできます。ブラウザの印刷機能でPDF保存してください。</div>
        <div style={{...S.formCard,background:"#FAF7F2"}}>
          <div style={{fontSize:"13px",fontWeight:700,color:"#8B6914",marginBottom:"10px"}}>基本情報</div>
          <div style={S.formGrid}>
            <RF label="会社名（法人・団体名）"><input style={S.input} value={company.name} onChange={e=>setCompany(p=>({...p,name:e.target.value}))} placeholder="例: 株式会社○○"/></RF>
            <RF label="代表者名"><input style={S.input} value={company.rep} onChange={e=>setCompany(p=>({...p,rep:e.target.value}))} placeholder="例: 代表取締役 山田太郎"/></RF>
          </div>
          <div style={{fontSize:"13px",fontWeight:700,color:"#8B6914",margin:"14px 0 10px"}}>社内相談窓口</div>
          <div style={S.formGrid}>
            <RF label="担当部署・担当者"><input style={S.input} value={company.dept} onChange={e=>setCompany(p=>({...p,dept:e.target.value}))} placeholder="例: 本社 総務部 担当:佐藤"/></RF>
            <RF label="電話番号"><input style={S.input} value={company.phone} onChange={e=>setCompany(p=>({...p,phone:e.target.value}))} placeholder="例: 03-1234-5678"/></RF>
          </div>
          <RF label="メールアドレス"><input style={S.input} value={company.email} onChange={e=>setCompany(p=>({...p,email:e.target.value}))} placeholder="例: soumu@example.co.jp"/></RF>
          <div style={{fontSize:"13px",fontWeight:700,color:"#8B6914",margin:"14px 0 10px"}}>社外相談窓口（弁護士等）</div>
          <div style={S.formGrid}>
            <RF label="事務所名・担当者"><input style={S.input} value={company.ext_name} onChange={e=>setCompany(p=>({...p,ext_name:e.target.value}))} placeholder="例: ○○弁護士事務所 担当:田中弁護士"/></RF>
            <RF label="電話番号"><input style={S.input} value={company.ext_phone} onChange={e=>setCompany(p=>({...p,ext_phone:e.target.value}))} placeholder="例: 03-9876-5432"/></RF>
          </div>
          <RF label="メールアドレス"><input style={S.input} value={company.ext_email} onChange={e=>setCompany(p=>({...p,ext_email:e.target.value}))} placeholder="例: tanaka@law.co.jp"/></RF>
          <div style={{fontSize:"13px",fontWeight:700,color:"#8B6914",margin:"14px 0 10px"}}>判断基準の数値設定</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"12px"}}>
            <RF label="迷惑行為の時間上限（分）"><input style={S.input} type="number" value={company.limit_min} onChange={e=>setCompany(p=>({...p,limit_min:e.target.value}))}/></RF>
            <RF label="要求繰り返し上限（回）"><input style={S.input} type="number" value={company.limit_count} onChange={e=>setCompany(p=>({...p,limit_count:e.target.value}))}/></RF>
            <RF label="退去命令上限（回）"><input style={S.input} type="number" value={company.limit_exit} onChange={e=>setCompany(p=>({...p,limit_exit:e.target.value}))}/></RF>
          </div>
        </div>
        <div style={{display:"flex",gap:"8px",marginTop:"12px"}}>
          <button style={S.primaryBtn} onClick={()=>{
            const c=company;const cn=c.name||"○○株式会社";
            const w=window.open("","_blank");if(!w)return alert("ポップアップがブロックされました");
            w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${cn} カスタマーハラスメント対策マニュアル</title><style>@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap');body{font-family:'Noto Sans JP',sans-serif;padding:48px 56px;font-size:13px;color:#333;line-height:1.8;max-width:800px;margin:0 auto}h1{font-size:22px;color:#0F172A;text-align:center;border-bottom:3px solid #0F172A;padding-bottom:10px;margin-bottom:8px}h2{font-size:16px;color:#0F172A;border-left:4px solid #1D4ED8;padding-left:12px;margin-top:28px;margin-bottom:8px;page-break-after:avoid}h3{font-size:14px;color:#334155;margin-top:16px;margin-bottom:6px}p{margin:0 0 6px}.box{background:#F8FAFC;border:1px solid #E2E8F0;border-left:4px solid #1D4ED8;padding:12px 16px;margin:8px 0;border-radius:3px;page-break-inside:avoid}.warn{border-left-color:#B91C1C;background:#FEF2F2}table{width:100%;border-collapse:collapse;margin:8px 0;page-break-inside:avoid}th{background:#0F172A;color:#FFF;padding:6px 10px;text-align:left;font-size:12px}td{padding:6px 10px;border:1px solid #E2E8F0;font-size:12px}tr:nth-child(even) td{background:#F8FAFC}ul{padding-left:18px;margin:4px 0}li{margin-bottom:3px}.step{display:flex;gap:10px;margin:6px 0;page-break-inside:avoid}.sn{background:#0F172A;color:#FFF;width:28px;height:28px;border-radius:3px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex-shrink:0}.sc{flex:1;background:#F1F5F9;padding:8px 12px;border-radius:3px}.cover{text-align:center;page-break-after:always;padding-top:120px}.cover h1{font-size:32px;border:none;margin-bottom:4px}.sub{color:#64748B;font-size:12px}.report-table th{background:#EFF6FF;color:#1D4ED8;width:140px;vertical-align:top}.report-table td{min-height:30px}@media print{body{padding:24px 32px}h2{page-break-after:avoid}.cover{padding-top:80px}}</style></head><body>
<div class="cover"><div style="font-size:14px;color:#B91C1C;font-weight:700;text-align:right;margin-bottom:60px">社外秘</div><h1>カスタマーハラスメント<br/>対策マニュアル</h1><p style="color:#1D4ED8;font-size:14px;margin-top:16px">東京都カスタマー・ハラスメント防止条例準拠</p><p style="color:#64748B;margin-top:8px">令和7年（2025年）</p><p style="font-size:20px;font-weight:700;margin-top:60px">${cn}</p></div>
<h2>1. はじめに</h2><p>近年、カスタマーハラスメントが深刻な課題となっています。東京都では令和6年10月に「東京都カスタマー・ハラスメント防止条例」が成立し、カスタマーハラスメントの防止に向けた措置が求められています。</p><p>${cn}においては、現場の従業員任せにすることなく、統一的な対応方法を定め、組織的なカスタマーハラスメント対策に取り組みます。</p>
<h2>2. カスタマーハラスメントの定義</h2><div class="box"><strong>「顧客等から従業員に対して行われる著しい迷惑行為であって、従業員の就業環境を害するもの」</strong></div><p>著しい迷惑行為の例:</p><ul><li>暴力行為</li><li>暴言・侮辱・誹謗中傷</li><li>威嚇・脅迫</li><li>人格否定・差別的発言</li><li>土下座の要求</li><li>長時間の拘束</li><li>過剰な対応の強要</li><li>不当・過剰な要求</li><li>SNS等への信用棄損投稿</li><li>セクハラ・SOGIハラ・つきまとい行為</li></ul>
<h2>3. 基本方針</h2><div class="box"><strong>${cn}「カスタマーハラスメントに対する基本方針」</strong><ol><li>お客様のご意見・ご要望に真摯に対応します</li><li>カスハラ該当行為には従業員を守るため毅然と対応します</li><li>被害を受けた従業員のケアを最優先します</li><li>知識・対処方法の研修を実施します</li><li>相談窓口の設置・警察・弁護士等との連携体制を整備します</li><li>カスハラと判断した場合、対応打ち切り・サービス提供をお断りする場合があります</li><li>悪質な場合は警察や外部専門家と連携し毅然と対応します</li></ol></div>
<h2>4. 顧客対応の基本的な心構え</h2><ul><li><strong>傾聴する</strong> — 相手の気持ちを理解し背景を推し測る</li><li><strong>誠実に対応</strong> — 表情・言葉遣いに注意。クレーマー扱いしない</li><li><strong>共感を伝える</strong> — あいづちを活用する</li><li><strong>限定的な謝罪</strong> — 責任不明の段階では対象を限定した謝罪</li><li><strong>対応者を代わる</strong> — 怒りが収まらない場合は躊躇せず交代</li></ul>
<h2>5. クレームの初期対応</h2><div class="step"><div class="sn">1</div><div class="sc"><strong>顧客に寄り添う</strong> — 正当な要求は真摯に受け止め傾聴する</div></div><div class="step"><div class="sn">2</div><div class="sc"><strong>要求内容を特定</strong> — 要求を明確にし議論を限定する</div></div><div class="step"><div class="sn">3</div><div class="sc"><strong>事実確認（5W1H）</strong> — 正確に確認。確認前は限定的謝罪</div></div><div class="step"><div class="sn">4</div><div class="sc"><strong>複数人対応</strong> — 原則複数人で。役割分担を明確に</div></div><div class="step"><div class="sn">5</div><div class="sc"><strong>場所選定</strong> — オープンスペースで。会議室は密室にしない</div></div><div class="step"><div class="sn">6</div><div class="sc"><strong>記録</strong> — 詳細に記録し会話を録音する</div></div>
<h2>6. カスタマーハラスメントの判断基準</h2><table><tr><th>判断項目</th><th>チェックポイント</th></tr><tr><td><strong>要求態様</strong></td><td>暴言・暴力・脅迫・無断撮影等</td></tr><tr><td><strong>要求内容</strong></td><td>不当な金品・土下座・書面謝罪・解雇要求等</td></tr><tr><td><strong>時間・回数</strong></td><td>迷惑行為が${c.limit_min}分超継続 / 退去命令${c.limit_exit}回以上不服従 / 要求${c.limit_count}回以上反復 / 時間外苦情</td></tr></table>
<h2>7. 対応フロー</h2><div class="step"><div class="sn">1</div><div class="sc"><strong>一次対応（現場従業員）</strong> — 行為中止を求め組織的対応に移行。監督者に報告</div></div><div class="step"><div class="sn">2</div><div class="sc"><strong>二次対応（監督者）</strong> — 対応を代わり安全確保。組織としての回答を伝達</div></div><div class="step"><div class="sn">3</div><div class="sc"><strong>警告・退去命令</strong> — ${c.limit_min}分目安で中止。暴力の兆候は即退去命令</div></div><div class="step"><div class="sn">4</div><div class="sc"><strong>警察連携</strong> — 退去不服従・暴力は警察通報</div></div>
<h2>8. 行為別対応例</h2><table><tr><th>行為</th><th>対応</th></tr><tr><td>暴言</td><td>冷静に対応。繰り返す場合は打ち切り。録音・記録を残す</td></tr><tr><td>執拗な要求</td><td>対応不可を明確に。${c.limit_min}分超で警察相談を伝える</td></tr><tr><td>土下座要求</td><td>「そのような対応はできません」と明確に拒否</td></tr><tr><td>暴行</td><td>刑法208条該当。即座に警察通報。複数人で対応</td></tr><tr><td>高圧的言動</td><td>曖昧な発言を避け安易な妥協をしない</td></tr><tr><td>長時間拘束</td><td>${c.limit_min}分超で打ち切り</td></tr><tr><td>セクハラ</td><td>不快である旨を明確に伝え改めない場合はサービス打ち切り</td></tr></table>
<h2>9. 警察との連携</h2><div class="step"><div class="sn">1</div><div class="sc">対応の中止を伝える（監督者含め複数名で判断）</div></div><div class="step"><div class="sn">2</div><div class="sc">行為の中止を求める（2〜3度繰り返す）</div></div><div class="step"><div class="sn">3</div><div class="sc">退去を命令する（施設管理権に基づき2〜3度）</div></div><div class="step"><div class="sn">4</div><div class="sc">警察に通報する（110番 / 相談は#9110）</div></div><div class="step"><div class="sn">5</div><div class="sc">警察官に状況説明し退去させたい旨を明確に伝える</div></div>
<h2>10. 社内体制</h2><h3>相談窓口</h3><table><tr><th>区分</th><th>連絡先</th></tr><tr><td><strong>社内窓口</strong></td><td>${c.dept||"○○部○○課"}<br/>電話: ${c.phone||"○○-○○-○○"} / メール: ${c.email||"○○@○○"}</td></tr><tr><td><strong>社外窓口</strong></td><td>${c.ext_name||"○○弁護士事務所"}<br/>電話: ${c.ext_phone||"○○-○○-○○"} / メール: ${c.ext_email||"○○@○○"}</td></tr></table>
<h3>再発防止の取組</h3><ul><li>従業員への注意喚起メッセージの発信</li><li>事例の検証・マニュアル改定・研修見直し</li><li>プライバシーに配慮した社内情報共有</li><li>定期的な研修の実施</li><li>社内アンケート等を参考にした取組の見直し</li></ul>
<h2>11. 緊急連絡先一覧</h2><table><tr><th>連絡先</th><th>電話番号</th><th>用途</th></tr><tr><td>警察（緊急）</td><td style="color:#B91C1C;font-weight:700">110</td><td>暴力等の緊急時</td></tr><tr><td>警察相談</td><td style="color:#B91C1C;font-weight:700">#9110</td><td>緊急性のない相談</td></tr><tr><td>社内相談窓口</td><td>${c.phone||"○○-○○-○○"}</td><td>カスハラ全般</td></tr><tr><td>社外窓口</td><td>${c.ext_phone||"○○-○○-○○"}</td><td>法的対応</td></tr></table>
<div class="box warn"><strong>本マニュアルは社外秘です。</strong>定期的に見直しを行い、最新の状態を維持してください。</div>
</body></html>`);w.document.close();w.print();
          }}>PDF生成（印刷画面で「PDFに保存」）</button>
        </div>
        <div style={{fontSize:"13px",color:"#8C7E6A",marginTop:"10px",lineHeight:1.7}}>※ブラウザの印刷画面が開きます。「送信先」で「PDFに保存」を選択してください。<br/>※A4縦で出力されます。奨励金申請にそのまま使用できます。<br/>※ファイル名は「10_マニュアル_企業名.pdf」に変更してください。</div>
      </div>
    </div>}
  </div>);
}

const S = {
  loadingScreen:{display:"flex",justifyContent:"center",alignItems:"center",minHeight:"100vh",background:"linear-gradient(160deg,#1A1E2E 0%,#252B3B 50%,#2C3344 100%)",fontFamily:"'Zen Kaku Gothic New','Noto Sans JP',sans-serif"},
  brandMark:{margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"center",gap:"0px"},
  brandMarkSm:{display:"flex",alignItems:"center",gap:"0px",flexShrink:0},
  loginBg:{minHeight:"100vh",background:"linear-gradient(160deg,#1A1E2E 0%,#252B3B 50%,#2C3344 100%)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Zen Kaku Gothic New','Noto Sans JP',sans-serif",padding:"24px"},
  loginCard:{width:"100%",maxWidth:"400px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:"14px",padding:"40px 32px",animation:"fadeIn 0.5s ease",backdropFilter:"blur(20px)"},
  errorMsg:{background:"rgba(185,28,28,0.08)",border:"1px solid rgba(185,28,28,0.15)",color:"#FCA5A5",fontSize:"13px",padding:"10px 14px",borderRadius:"8px",marginBottom:"14px"},
  labelDark:{display:"block",fontSize:"11.5px",fontWeight:500,color:"#9C9080",marginBottom:"6px",letterSpacing:"0.3px"},
  inputDark:{width:"100%",padding:"10px 14px",fontSize:"14px",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"8px",color:"#F1F5F9",fontFamily:"'Noto Sans JP','Inter',sans-serif"},
  eyeBtn:{position:"absolute",right:"12px",top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#8C7E6A",cursor:"pointer",fontSize:"11px",fontFamily:"'Noto Sans JP',sans-serif"},
  loginBtn:{width:"100%",padding:"12px",fontSize:"14px",fontWeight:600,background:"linear-gradient(135deg,#F5F0E8,#E8E0D4)",color:"#3D3629",border:"none",borderRadius:"8px",cursor:"pointer",marginTop:"8px",fontFamily:"'Zen Kaku Gothic New','Noto Sans JP',sans-serif",letterSpacing:"0.3px"},
  dashLayout:{display:"flex",minHeight:"100vh",fontFamily:"'Zen Kaku Gothic New','Noto Sans JP',sans-serif",background:"#F5F2ED"},
  sidebar:{width:"240px",background:"linear-gradient(180deg,#1E2233 0%,#1A1E2E 100%)",display:"flex",flexDirection:"column",position:"fixed",top:0,left:0,bottom:0,zIndex:10,borderRight:"1px solid rgba(255,255,255,0.04)"},
  sidebarHeader:{display:"flex",alignItems:"center",gap:"11px",padding:"20px 16px",borderBottom:"1px solid rgba(255,255,255,0.06)"},
  sidebarNav:{flex:1,padding:"12px 10px",display:"flex",flexDirection:"column",gap:"2px",overflowY:"auto"},
  navItem:{display:"flex",alignItems:"center",padding:"9px 14px",background:"none",border:"none",borderRadius:"7px",color:"#9C9080",fontSize:"13px",cursor:"pointer",transition:"all 0.15s ease",textAlign:"left",fontFamily:"'Zen Kaku Gothic New','Noto Sans JP',sans-serif",width:"100%",fontWeight:500,letterSpacing:"0.2px"},
  navItemActive:{background:"rgba(245,240,232,0.1)",color:"#F5F0E8",fontWeight:600},
  sidebarFooter:{padding:"14px 12px",borderTop:"1px solid rgba(255,255,255,0.06)",display:"flex",flexDirection:"column",gap:"8px"},
  userInfo:{display:"flex",alignItems:"center",gap:"9px"},
  userAvatar:{width:"32px",height:"32px",borderRadius:"7px",background:"linear-gradient(135deg,#2C3344,#3D4556)",border:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"center",color:"#A0AABB",fontSize:"12px",fontWeight:600,flexShrink:0},
  logoutBtn:{display:"flex",alignItems:"center",justifyContent:"center",padding:"8px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:"7px",color:"#9C9080",fontSize:"12px",fontWeight:500,cursor:"pointer",fontFamily:"'Zen Kaku Gothic New','Noto Sans JP',sans-serif",letterSpacing:"0.3px"},
  mainContent:{flex:1,marginLeft:"240px",minHeight:"100vh"},
  pageTitle:{fontSize:"18px",fontWeight:700,color:"#2C2418",letterSpacing:"-0.2px",marginBottom:"6px",fontFamily:"'Zen Kaku Gothic New','Noto Sans JP',sans-serif"},
  sectionTitle:{fontSize:"14px",fontWeight:700,color:"#3D3629",marginBottom:"12px",letterSpacing:"0.2px"},
  statCard:{background:"#FFFFFF",borderRadius:"10px",padding:"18px",border:"1px solid #E8E2D8",boxShadow:"0 1px 3px rgba(60,50,30,0.04)"},
  card:{background:"#FFFFFF",borderRadius:"10px",padding:"20px",border:"1px solid #E8E2D8",boxShadow:"0 1px 3px rgba(60,50,30,0.04)"},
  tableWrap:{background:"#FFFFFF",borderRadius:"10px",overflow:"hidden",border:"1px solid #E8E2D8",boxShadow:"0 1px 3px rgba(60,50,30,0.04)"},
  table:{width:"100%",borderCollapse:"collapse"},
  th:{textAlign:"left",padding:"10px 14px",fontSize:"11px",fontWeight:700,color:"#8C7E6A",background:"#FAF7F2",borderBottom:"1px solid #EDE8E0",letterSpacing:"0.5px",textTransform:"uppercase"},
  td:{padding:"10px 14px",fontSize:"13px",color:"#4A4035",borderBottom:"1px solid #F0ECE5"},
  tr:{transition:"background 0.12s ease"},
  badge:{display:"inline-block",padding:"3px 9px",borderRadius:"5px",fontSize:"11px",fontWeight:600,letterSpacing:"0.1px"},
  emptyState:{textAlign:"center",padding:"44px",color:"#A09888",fontSize:"13px",letterSpacing:"0.2px"},
  primaryBtn:{display:"inline-flex",alignItems:"center",gap:"5px",padding:"9px 18px",background:"#2C3344",color:"#F5F0E8",border:"none",borderRadius:"7px",fontSize:"13px",fontWeight:600,cursor:"pointer",fontFamily:"'Zen Kaku Gothic New','Noto Sans JP',sans-serif",letterSpacing:"0.2px",boxShadow:"0 1px 3px rgba(30,34,51,0.15)"},
  secondaryBtn:{padding:"9px 14px",background:"#FAF7F2",color:"#4A4035",border:"1px solid #E0D9CE",borderRadius:"7px",fontSize:"13px",fontWeight:500,cursor:"pointer",fontFamily:"'Zen Kaku Gothic New','Noto Sans JP',sans-serif"},
  ghostBtn:{padding:"9px 14px",background:"none",color:"#6B5D4D",border:"1px solid #DDD6CA",borderRadius:"7px",fontSize:"13px",cursor:"pointer",fontFamily:"'Zen Kaku Gothic New','Noto Sans JP',sans-serif"},
  tinyBtn:{padding:"4px 9px",background:"#FAF7F2",color:"#4A4035",border:"1px solid #E0D9CE",borderRadius:"5px",fontSize:"12px",cursor:"pointer",fontFamily:"'Noto Sans JP','Inter',sans-serif",display:"inline-flex",alignItems:"center",gap:"3px",position:"relative"},
  uploadBtn:{padding:"8px 14px",background:"#FFFFFF",color:"#4A4035",border:"1px solid #DDD6CA",borderRadius:"7px",fontSize:"13px",fontWeight:500,cursor:"pointer",fontFamily:"'Zen Kaku Gothic New','Noto Sans JP',sans-serif",boxShadow:"0 1px 2px rgba(60,50,30,0.04)"},
  formCard:{background:"#FFFFFF",borderRadius:"10px",padding:"22px",border:"1px solid #E8E2D8",boxShadow:"0 1px 3px rgba(60,50,30,0.04)",marginBottom:"16px"},
  formGrid:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"14px",marginBottom:"6px"},
  inputGroup:{marginBottom:"14px"},
  label:{display:"block",fontSize:"11.5px",fontWeight:700,color:"#8C7E6A",marginBottom:"5px",letterSpacing:"0.3px"},
  input:{width:"100%",padding:"10px 13px",fontSize:"13.5px",background:"#FAFAF8",border:"1px solid #DDD6CA",borderRadius:"7px",color:"#2C2418",fontFamily:"'Noto Sans JP','Inter',sans-serif"},
  select:{width:"100%",padding:"10px 13px",fontSize:"13.5px",background:"#FAFAF8",border:"1px solid #DDD6CA",borderRadius:"7px",color:"#2C2418",fontFamily:"'Noto Sans JP','Inter',sans-serif",appearance:"auto"},
  textarea:{width:"100%",padding:"11px 13px",fontSize:"13.5px",background:"#FAFAF8",border:"1px solid #DDD6CA",borderRadius:"7px",color:"#2C2418",fontFamily:"'Noto Sans JP','Inter',sans-serif",lineHeight:1.7},
};
