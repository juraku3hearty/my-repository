-- =====================================================================
-- ダンドリ — Supabase スキーマ（スプリント1）
--
-- 方針
--  * 「曜日デフォルト」を必ず持たせ、その日の例外だけを day_overrides に積む。
--    → 平和な日はレコードが1行も増えない＝鳥が黙る根拠になる（設計原則2）
--  * 予定の詳細は本人だけ。家族に見せる文言は abstract_label に分離（設計原則・プライバシー）
--  * タスクの assignee_member_id が NULL＝担当未定＝グループに募集を出す対象（設計原則3）
--  * LINEユーザーIDは line_links に隔離し、members 自体には持たせない
--    （1人が複数チャネルを持つ将来と、退会時の物理削除をやりやすくするため）
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 家族
-- ---------------------------------------------------------------------
create table if not exists families (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  plan          text not null default 'free' check (plan in ('free', 'paid')),
  -- ダンドリBotを招待した家族LINEグループ。ここへのPushが「グループ層」
  line_group_id text unique,
  -- 有料版の通知カスタム（時間帯など）。無料版は使わない
  notify_config jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- メンバー
--   member_type
--     line    … LINE接続済み。自分宛のことだけ届く
--     profile … LINE無し（小さい子）。通知は proxy_member_id の親へ回す
--     muted   … 通知オフ。ボードを開いた時だけ応答する
-- ---------------------------------------------------------------------
create table if not exists members (
  id               uuid primary key default gen_random_uuid(),
  family_id        uuid not null references families(id) on delete cascade,
  name             text not null,
  short_name       text not null,
  role             text,
  member_type      text not null default 'line'
                     check (member_type in ('line', 'profile', 'muted')),
  proxy_member_id  uuid references members(id) on delete set null,
  color            text not null default '#e07a4f',
  sort_order       int  not null default 100,
  created_at       timestamptz not null default now()
);
create index if not exists members_family_idx on members(family_id);

-- ---------------------------------------------------------------------
-- LINEユーザーの紐付け
--   グループにダンドリを招待 → 各自が自分の名前をタップ（postback）
--   → そのpostbackに載る group_id + user_id が「この家族の一員である証明」
-- ---------------------------------------------------------------------
create table if not exists line_links (
  line_user_id   text primary key,
  member_id      uuid not null references members(id) on delete cascade,
  family_id      uuid not null references families(id) on delete cascade,
  -- 紐付けの根拠になったグループID（在籍証明）
  proved_via_group_id text,
  linked_at      timestamptz not null default now()
);
create index if not exists line_links_member_idx on line_links(member_id);

-- ---------------------------------------------------------------------
-- 曜日別デフォルト（初期設定ウィザードで全員ぶん必須入力）
--   dinner='unknown' を入れた曜日だけ、ダンドリが毎回聞きに行く
-- ---------------------------------------------------------------------
create table if not exists weekday_defaults (
  member_id  uuid not null references members(id) on delete cascade,
  weekday    smallint not null check (weekday between 0 and 6), -- 0=日
  dinner     text not null default 'in' check (dinner in ('in', 'out', 'unknown')),
  bento      boolean not null default false,
  home_by    time,
  primary key (member_id, weekday)
);

-- ---------------------------------------------------------------------
-- その日の例外だけ。デフォルト通りの日は行を作らない
--   answered_at が NULL ＝ 未回答（ボードで赤・ダンドリが聞く対象）
-- ---------------------------------------------------------------------
create table if not exists day_overrides (
  member_id   uuid not null references members(id) on delete cascade,
  date        date not null,
  dinner      text check (dinner in ('in', 'out', 'unknown')),
  bento       boolean,
  home_by     time,
  note        text,
  answered_at timestamptz,
  updated_at  timestamptz not null default now(),
  primary key (member_id, date)
);
create index if not exists day_overrides_date_idx on day_overrides(date);

-- ---------------------------------------------------------------------
-- 予定
--   visibility
--     shared   … 家族に title をそのまま見せる
--     abstract … 家族には abstract_label を見せる（外出中、など）
--     private  … 本人以外には abstract_label のみ。詳細は絶対に返さない
--                （会話クエリの応答でも同じルールを適用すること）
-- ---------------------------------------------------------------------
create table if not exists events (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid not null references families(id) on delete cascade,
  owner_member_id uuid references members(id) on delete set null,
  date            date not null,
  start_at        time,
  end_at          time,
  title           text not null,
  place           text,
  visibility      text not null default 'shared'
                    check (visibility in ('shared', 'abstract', 'private')),
  abstract_label  text,
  source          text not null default 'manual'
                    check (source in ('manual', 'ocr', 'line')),
  created_at      timestamptz not null default now(),
  -- private/abstract なら家族向けの言い換えが必ず要る
  constraint events_abstract_required
    check (visibility = 'shared' or abstract_label is not null)
);
create index if not exists events_family_date_idx on events(family_id, date);

-- ---------------------------------------------------------------------
-- タスク
--   assignee_member_id が NULL ＝ 担当未定。グループに募集を出し、
--   最初に【引き受ける】を押した人で確定する（設計原則3）
-- ---------------------------------------------------------------------
create table if not exists tasks (
  id                 uuid primary key default gen_random_uuid(),
  family_id          uuid not null references families(id) on delete cascade,
  event_id           uuid references events(id) on delete cascade,
  title              text not null,
  due_at             timestamptz not null,
  assignee_member_id uuid references members(id) on delete set null,
  kind               text not null default 'chore'
                       check (kind in ('prep', 'chore', 'pickup')),
  status             text not null default 'open'
                       check (status in ('open', 'done', 'skipped')),
  source             text not null default 'manual'
                       check (source in ('manual', 'ocr', 'line', 'auto')),
  claimed_at         timestamptz,
  done_at            timestamptz,
  created_at         timestamptz not null default now()
);
create index if not exists tasks_family_due_idx on tasks(family_id, due_at);
create index if not exists tasks_open_unassigned_idx
  on tasks(family_id, due_at) where status = 'open' and assignee_member_id is null;

-- ---------------------------------------------------------------------
-- 行事プリントOCR
-- ---------------------------------------------------------------------
create table if not exists ocr_uploads (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references families(id) on delete cascade,
  member_id  uuid references members(id) on delete set null,
  storage_path text not null,
  status     text not null default 'queued'
               check (status in ('queued', 'done', 'failed')),
  extracted  jsonb,
  error      text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 通知ログ
--   LINEのPushは「受信人数分」課金される。無料枠200通/月を守るため、
--   送った1通ごとに1行入れて家族単位・月単位で数える（counted=false は reply＝無料）
-- ---------------------------------------------------------------------
create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references families(id) on delete cascade,
  member_id   uuid references members(id) on delete set null,
  channel     text not null default 'line_push'
                check (channel in ('line_push', 'line_reply', 'line_group_push', 'board')),
  kind        text not null,
  payload     jsonb,
  -- LINEの課金対象か（push=true / reply=false）
  counted     boolean not null default true,
  sent_at     timestamptz not null default now()
);
create index if not exists notifications_family_month_idx
  on notifications(family_id, sent_at) where counted;

-- ---------------------------------------------------------------------
-- RLS（スプリント2でLIFF認証を入れるときに有効化する）
--   すべてのテーブルは「自分が属する family_id の行だけ」に絞る。
--   events だけは visibility='private' かつ owner<>自分 の場合、
--   ビュー経由で title / place を落として返す。
-- ---------------------------------------------------------------------
-- alter table families        enable row level security;
-- alter table members         enable row level security;
-- alter table weekday_defaults enable row level security;
-- alter table day_overrides   enable row level security;
-- alter table events          enable row level security;
-- alter table tasks           enable row level security;
-- alter table notifications   enable row level security;
