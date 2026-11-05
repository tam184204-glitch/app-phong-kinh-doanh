#!/usr/bin/env bash
# Chuyển dữ liệu module Kinh doanh từ CSDL độc lập (ctg_kinhdoanh, schema public) sang CSDL chung Khối Home (duan-noxh-ct, schema kd).
# CHỈ chạy trên máy có dữ liệu thật. Không commit tệp dump. CSDL nguồn chỉ đọc, không bị sửa.
#
#   SRC_URL   chuỗi kết nối CSDL nguồn          (vd postgres://kd_app:***@localhost:5432/ctg_kinhdoanh)
#   PGBIN     thư mục bin PostgreSQL 18          (vd "/c/Users/tam/pgsql18/bin")
#   PGHOST PGPORT PGUSER                         máy chủ CSDL chung, tài khoản superuser (mật khẩu trong pgpass)
#   DST_DB    tên CSDL chung                     (mặc định duan-noxh-ct)
#   APP_DIR   thư mục mã nguồn app Kinh doanh    (mặc định thư mục cha của tools/)
#
# Các bước:
#   1. dump nguồn (cấu trúc + dữ liệu bảng kd_*)
#   2. dựng CSDL trung gian kd_trung_gian trên máy đích, chạy migrate() của app → cấu trúc + chuẩn hóa dữ liệu đúng bản mã hiện tại
#   3. đối chiếu cột trung gian ↔ schema kd (khác thì dừng)
#   4. đổ dữ liệu vào kd trong MỘT giao dịch (xóa dữ liệu kd cũ trước), đặt lại chuỗi số, đối chiếu số dòng từng bảng
set -euo pipefail
: "${SRC_URL:?đặt SRC_URL}" "${PGBIN:?đặt PGBIN}" "${PGHOST:?}" "${PGPORT:?}" "${PGUSER:?}"
DST_DB="${DST_DB:-duan-noxh-ct}"
APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
STG=kd_trung_gian
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
export PGCLIENTENCODING=UTF8
psql() { "$PGBIN/psql" -w -v ON_ERROR_STOP=1 "$@"; }

echo "1. Dump nguồn"
"$PGBIN/pg_dump" "$SRC_URL" -n public --no-owner --no-acl -f "$WORK/src.sql"

echo "2. CSDL trung gian $STG + migrate() của app"
psql -d postgres -qc "DROP DATABASE IF EXISTS $STG" -c "CREATE DATABASE $STG"
grep -vE '^(CREATE SCHEMA public;|COMMENT ON SCHEMA public)' "$WORK/src.sql" | psql -d $STG -q > /dev/null
( cd "$APP_DIR" && KD_DB_SCHEMA= DATABASE_URL="postgres://$PGUSER@$PGHOST:$PGPORT/$STG" node -e "
  const db = require('./server/db'); require('./server/schema').migrate(db).then(() => db.pool.end()).catch(e => { console.error(e.message); process.exit(1); })" )
# cột đã bỏ khỏi mã nguồn (chỉ bỏ khi toàn bộ rỗng)
for c in kd_customer.bravo_id; do
  t=${c%.*}; k=${c#*.}
  if [ "$(psql -d $STG -tAc "SELECT count(*) FROM information_schema.columns WHERE table_name='$t' AND column_name='$k'")" = 1 ]; then
    n=$(psql -d $STG -tAc "SELECT count(*) FROM $t WHERE $k IS NOT NULL")
    [ "$n" = 0 ] || { echo "DỪNG: $c còn $n dòng có dữ liệu"; exit 1; }
    psql -d $STG -qc "ALTER TABLE $t DROP COLUMN $k"
  fi
done

echo "3. Đối chiếu cột"
Q="SELECT table_name||'.'||column_name||' '||data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name LIKE 'kd\_%' ORDER BY 1"
psql -d $STG -tAc "$Q" | sort > "$WORK/a.txt"
PGOPTIONS="-c search_path=kd" psql -d "$DST_DB" -tAc "$Q" | sort > "$WORK/b.txt"
if ! diff "$WORK/a.txt" "$WORK/b.txt"; then echo "DỪNG: cấu trúc khác — viết migration bù trước"; exit 1; fi

echo "4. Đổ dữ liệu vào $DST_DB.kd"
"$PGBIN/pg_dump" -w -d $STG -n public --data-only --no-owner --no-acl -f "$WORK/data.sql"
TABLES=$(psql -d "$DST_DB" -tAc "SELECT string_agg('kd.'||tablename, ', ' ORDER BY tablename) FROM pg_tables WHERE schemaname='kd'")
{
  echo "BEGIN;"
  echo "SET LOCAL session_replication_role = replica;"   # bỏ qua thứ tự khóa ngoại (kd_contract, kd_price_policy tự tham chiếu); ràng buộc kiểm lại ở dưới
  echo "TRUNCATE $TABLES;"
  grep -vE '^(SET |SELECT pg_catalog.set_config|\\(un)?restrict)' "$WORK/data.sql" | sed 's/\bpublic\./kd./g'
  echo "COMMIT;"
} > "$WORK/load.sql"
psql -d "$DST_DB" -q -f "$WORK/load.sql" > /dev/null

echo "   kiểm khóa ngoại sau khi đổ"
psql -d "$DST_DB" -tA > "$WORK/fk.txt" <<'SQL'
DO $$
DECLARE r record; n bigint; bad text := '';
BEGIN
  FOR r IN SELECT c.conrelid::regclass t, c.confrelid::regclass f, a.attname col, fa.attname fcol
           FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
           JOIN pg_attribute fa ON fa.attrelid=c.confrelid AND fa.attnum=c.confkey[1]
           WHERE c.contype='f' AND c.connamespace='kd'::regnamespace LOOP
    EXECUTE format('SELECT count(*) FROM %s x WHERE x.%I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM %s y WHERE y.%I = x.%I)', r.t, r.col, r.f, r.fcol, r.col) INTO n;
    IF n > 0 THEN bad := bad || format('%s.%s: %s; ', r.t, r.col, n); END IF;
  END LOOP;
  IF bad <> '' THEN RAISE EXCEPTION 'khóa ngoại hỏng: %', bad; END IF;
END $$;
SQL

echo "   đối chiếu số dòng"
psql -d $STG -tAc "SELECT string_agg(format('SELECT %L, count(*) FROM %I', tablename, tablename), ' UNION ALL ' ORDER BY tablename) || ';' FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'kd\_%'" > "$WORK/cnt.sql"
psql -d $STG -tA -f "$WORK/cnt.sql" | sort > "$WORK/ca.txt"
PGOPTIONS="-c search_path=kd" psql -d "$DST_DB" -tA -f "$WORK/cnt.sql" | sort > "$WORK/cb.txt"
if ! diff "$WORK/ca.txt" "$WORK/cb.txt"; then echo "LỆCH số dòng"; exit 1; fi
awk -F'|' '{s+=$2} END {print "   khớp: " NR " bảng, " s " dòng"}' "$WORK/ca.txt"
psql -d postgres -qc "DROP DATABASE $STG"
echo "Xong. Tệp đính kèm (data/files/) chép riêng sang máy chủ module."
