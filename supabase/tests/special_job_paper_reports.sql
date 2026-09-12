\set ON_ERROR_STOP on
SET ROLE postgres;
CREATE FUNCTION pg_temp.assert(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF; RAISE NOTICE 'PASS: %', label; END $$;
CREATE FUNCTION pg_temp.report(pid text DEFAULT 'OTHER', note text DEFAULT NULL,
    paper text DEFAULT 'paper', good integer DEFAULT 8, waste integer DEFAULT 2,
    at_time timestamptz DEFAULT '2026-09-11T00:00:00Z', oid bigint DEFAULT NULL) RETURNS bigint
LANGUAGE plpgsql AS $$ DECLARE rid bigint; BEGIN
 INSERT INTO public.paper_reports(product_id,remark,paper_type,good_a3,waste_a3,created_at,order_id,report_type,lot_number,department,target_a3,created_by)
 VALUES(pid,note,paper,good,waste,at_time,oid,CASE WHEN oid IS NULL THEN 'MANUAL' ELSE 'ORDER' END,'test','test',999,'test') RETURNING id INTO rid;
 RETURN rid;
END $$;
SELECT pg_temp.assert((SELECT count(*)=0 FROM special_job_paper_reports),'no backfill including retained BROCHUREA4');
SELECT pg_temp.assert((SELECT array_agg(id ORDER BY id)=ARRAY['BROCHUREA4','CARD'] FROM fgcode WHERE special_monthly_report_enabled),'only confirmed Products seeded');
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['คุณมิ้นท์','มิ้นท์','มิ้น','Mint','MINT','mint','  งานคุณมิ้นท์  ',E'for\n  Mint\tplease','(Mint)','Mint!'] LOOP
  PERFORM pg_temp.assert(public.special_monthly_note_matches(n),'positive note: '||n);
 END LOOP;
 FOREACH n IN ARRAY ARRAY['','-','another job','peppermint','minting','spearmint','MINTED','mint_123','xMint','Mint42'] LOOP
  PERFORM pg_temp.assert(NOT public.special_monthly_note_matches(n),'negative note: '||n);
 END LOOP;
 PERFORM pg_temp.assert(NOT public.special_monthly_note_matches(NULL),'null note');
END $$;
DO $$ DECLARE a bigint; b bigint; c bigint; BEGIN
 a:=pg_temp.report('CARD','Mint','300 แกรม');
 b:=pg_temp.report('BROCHUREA4',NULL,'130 แกรม');
 c:=pg_temp.report();
 PERFORM pg_temp.assert((SELECT source_kind='product_classified' AND job_type='business_card' AND paper_used_a3=10 AND paper_type='300 แกรม' FROM special_job_paper_reports WHERE source_paper_report_id=a),'CARD priority, total and selected paper');
 PERFORM pg_temp.assert((SELECT job_type='brochure' FROM special_job_paper_reports WHERE source_paper_report_id=b),'BROCHUREA4 category');
 PERFORM pg_temp.assert(NOT EXISTS(SELECT FROM special_job_paper_reports WHERE source_paper_report_id=c),'unrelated Product excluded');
 UPDATE paper_reports SET waste_a3_remark='Mint',waste_qty_remark='คุณมิ้นท์' WHERE id=c;
 PERFORM pg_temp.assert(NOT EXISTS(SELECT FROM special_job_paper_reports WHERE source_paper_report_id=c),'waste remarks excluded');
 UPDATE paper_reports SET remark='Mint' WHERE id=c;
 PERFORM pg_temp.assert(NOT EXISTS(SELECT FROM special_job_paper_reports WHERE source_paper_report_id=c),'UPDATE never captures missing snapshot');
 UPDATE fgcode SET name='Renamed' WHERE id='CARD';
 PERFORM pg_temp.assert((SELECT job_type='business_card' AND product_name_snapshot='Test card' FROM special_job_paper_reports WHERE source_paper_report_id=a),'Product rename preserves classification and name snapshot');
 UPDATE paper_reports SET good_a3=18,waste_a3=3,paper_type='corrected',remark=NULL WHERE id=a;
 PERFORM pg_temp.assert((SELECT paper_used_a3=21 AND paper_type='corrected' AND source_kind='product_classified' FROM special_job_paper_reports WHERE source_paper_report_id=a),'A3/paper corrections and classified note removal');
 UPDATE paper_reports SET product_id='BROCHUREA4' WHERE id=a;
 PERFORM pg_temp.assert((SELECT job_type='brochure' AND product_name_snapshot='Test brochure' FROM special_job_paper_reports WHERE source_paper_report_id=a),'eligible to eligible Product correction');
 UPDATE paper_reports SET product_id='OTHER',remark='Mint' WHERE id=a;
 PERFORM pg_temp.assert((SELECT job_type='note_based' AND source_kind='note_matched' FROM special_job_paper_reports WHERE source_paper_report_id=a),'Product corrected to note-based');
 UPDATE paper_reports SET remark=NULL WHERE id=a;
 PERFORM pg_temp.assert(NOT EXISTS(SELECT FROM special_job_paper_reports WHERE source_paper_report_id=a),'note removed removes contribution');
 UPDATE paper_reports SET product_id='OTHER' WHERE id=b;
 PERFORM pg_temp.assert(NOT EXISTS(SELECT FROM special_job_paper_reports WHERE source_paper_report_id=b),'eligible to noneligible removes contribution');
 UPDATE paper_reports SET product_id='CARD' WHERE id=b;
 PERFORM pg_temp.assert(NOT EXISTS(SELECT FROM special_job_paper_reports WHERE source_paper_report_id=b),'removed contribution never recreated by UPDATE');
END $$;
DO $$ DECLARE rid bigint; n text; BEGIN
 FOREACH n IN ARRAY ARRAY['คุณมิ้นท์','มิ้นท์','มิ้น','Mint','MINT','mint'] LOOP
  rid:=pg_temp.report('OTHER',n);
  PERFORM pg_temp.assert((SELECT source_kind='note_matched' AND job_type='note_based' FROM special_job_paper_reports WHERE source_paper_report_id=rid),'note capture '||n);
 END LOOP;
 rid:=pg_temp.report('CARD');
 BEGIN
  INSERT INTO special_job_paper_reports(source_paper_report_id,report_date,source_kind,job_type,product_id,paper_type,paper_used_a3)
  VALUES(rid,'2026-09-11','product_classified','business_card','CARD','paper',1);
  RAISE EXCEPTION 'duplicate source ID was accepted';
 EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: duplicate source ID rejected'; END;
 BEGIN
  PERFORM pg_temp.report('CARD',NULL,'paper',-4,0);
  RAISE EXCEPTION 'invalid capture was accepted';
 EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: capture failure rolls back source insert'; END;
 PERFORM pg_temp.assert(NOT EXISTS(SELECT FROM paper_reports WHERE good_a3=-4),'no source left after failed capture');
END $$;
-- Source reports and old calculations retain every contribution.
SELECT pg_temp.assert((SELECT count(*) FROM paper_reports) > (SELECT count(*) FROM special_job_paper_reports),'source reports remain additional only');
SELECT pg_temp.assert(NOT EXISTS(SELECT FROM information_schema.columns WHERE table_name='special_job_paper_reports' AND column_name IN ('remark','notes','waste_a3_remark','waste_qty_remark')),'raw notes not retained');
-- Explicit authorization: both exact weekly roles and no other role.
SELECT set_config('request.jwt.claim.role','authenticated',false);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SET ROLE authenticated;
SELECT pg_temp.assert(public.is_user_manager(),'moderator weekly eligibility');
SELECT count(*) FROM public.get_special_job_paper_month('2026-09-01');
SELECT public.reset_special_job_paper_month('2026-09-01');
RESET ROLE;
SET ROLE postgres;
SELECT set_config('request.jwt.claim.role','',false);
-- Isolated aggregation/date fixtures after clearing monthly snapshots.
SELECT pg_temp.report('CARD',NULL,'300 แกรม',16,2,'2026-09-30T16:30:00Z') AS sep_card \gset
SELECT pg_temp.report('BROCHUREA4',NULL,'130 แกรม',23,1,'2026-09-15T00:00:00Z');
SELECT pg_temp.report('OTHER','Mint','sticky',8,2,'2026-09-15T00:00:00Z');
SELECT pg_temp.report('OTHER2','งานคุณมิ้นท์','sticky',6,0,'2026-09-15T00:00:00Z');
SELECT pg_temp.report('CARD',NULL,'300 แกรม',5,0,'2026-09-30T17:10:00Z') AS oct_card \gset
SELECT pg_temp.report('CARD',NULL,'300 แกรม',7,0,'2026-08-30T00:00:00Z') AS aug_card \gset
SELECT pg_temp.assert((SELECT report_date='2026-09-30' FROM special_job_paper_reports WHERE source_paper_report_id=:sep_card),'23:30 Bangkok stays September');
SELECT pg_temp.assert((SELECT report_date='2026-10-01' FROM special_job_paper_reports WHERE source_paper_report_id=:oct_card),'00:10 Bangkok belongs October');
SELECT set_config('request.jwt.claim.role','authenticated',false);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
SET ROLE authenticated;
SELECT pg_temp.assert(public.is_user_manager(),'assistant moderator exact weekly eligibility');
SELECT pg_temp.assert((SELECT count(*)=3 AND sum(paper_used_a3)=58 FROM get_special_job_paper_month('2026-09-01')),'selected month grouping and total 58');
SELECT pg_temp.assert((SELECT paper_used_a3=16 FROM get_special_job_paper_month('2026-09-01') WHERE job_type='note_based' AND paper_type='sticky'),'different note Products aggregate together');
SELECT pg_temp.assert((SELECT count(*)=1 AND sum(paper_used_a3)=5 FROM get_special_job_paper_month('2026-10-01')),'other month excluded');
SELECT reset_special_job_paper_month('2026-09-01');
SELECT pg_temp.assert((SELECT count(*)=0 FROM get_special_job_paper_month('2026-09-01')),'monthly reset selected month only');
SELECT pg_temp.assert((SELECT sum(paper_used_a3)=7 FROM get_special_job_paper_month('2026-08-01')),'monthly reset preserves August');
SELECT pg_temp.assert((SELECT sum(paper_used_a3)=5 FROM get_special_job_paper_month('2026-10-01')),'monthly reset preserves October');
SELECT pg_temp.assert(EXISTS(SELECT FROM paper_reports WHERE id=:sep_card),'monthly reset preserves source');
UPDATE paper_reports SET good_a3=25,remark='Mint' WHERE id=:sep_card;
SELECT pg_temp.assert((SELECT count(*)=0 FROM get_special_job_paper_month('2026-09-01')),'source UPDATE after monthly reset cannot recreate');
SELECT pg_temp.report('CARD') AS new_card \gset
SELECT pg_temp.assert((SELECT sum(paper_used_a3)=10 FROM get_special_job_paper_month('2026-09-01')),'new INSERT after reset captures normally');
SELECT delete_paper_reports_individually(ARRAY[:new_card]::bigint[]);
SELECT pg_temp.assert(NOT EXISTS(SELECT FROM paper_reports WHERE id=:new_card),'individual deletion removes source');
SELECT pg_temp.assert((SELECT count(*)=0 FROM get_special_job_paper_month('2026-09-01')),'individual deletion removes snapshot');
-- Same raw report deletion used by existing weekly reset, no snapshot delete trigger.
DELETE FROM paper_reports WHERE id>0;
SELECT pg_temp.assert((SELECT count(*)=0 FROM paper_reports),'weekly reset clears sources');
SELECT pg_temp.assert((SELECT sum(paper_used_a3)=5 FROM get_special_job_paper_month('2026-10-01')),'weekly reset preserves monthly history');
RESET ROLE;
SET ROLE postgres;
SELECT set_config('request.jwt.claim.role','',false);
-- Order note is authoritative alongside a report's general remark.
INSERT INTO orders(order_date,order_time,order_datetime,lot_number,product_id,product_name,product_exp,production_date,expiry_date,created_by,notes)
VALUES('2026-09-11','10:00','2026-09-11T10:00:00+07','test','OTHER','Private','12','2026-09-11','2027-09-11','test','Mint') RETURNING id AS order_id \gset
SELECT pg_temp.report('OTHER',NULL,'paper',8,2,'2026-09-11T00:00:00Z',:order_id) AS linked \gset
SELECT pg_temp.assert((SELECT job_type='note_based' FROM special_job_paper_reports WHERE source_paper_report_id=:linked),'order-linked report uses orders.notes');
UPDATE orders SET notes='unrelated' WHERE id=:order_id;
SELECT pg_temp.assert(NOT EXISTS(SELECT FROM special_job_paper_reports WHERE source_paper_report_id=:linked),'orders.notes correction removes existing snapshot');
UPDATE orders SET notes='Mint' WHERE id=:order_id;
SELECT pg_temp.assert(NOT EXISTS(SELECT FROM special_job_paper_reports WHERE source_paper_report_id=:linked),'orders.notes correction never inserts missing snapshot');
SELECT pg_temp.report('CARD',NULL,'paper',8,2,'2026-09-11T00:00:00Z',:order_id) AS linked_card \gset
UPDATE orders SET notes=NULL WHERE id=:order_id;
SELECT pg_temp.assert((SELECT job_type='business_card' FROM special_job_paper_reports WHERE source_paper_report_id=:linked_card),'Product classification survives order note removal');
SELECT pg_temp.report('OTHER','Mint','paper',8,2,'2026-09-11T00:00:00Z',:order_id) AS linked_remark \gset
SELECT pg_temp.assert((SELECT job_type='note_based' FROM special_job_paper_reports WHERE source_paper_report_id=:linked_remark),'linked report general remark also usable');
UPDATE paper_reports SET remark=NULL WHERE id=:linked_remark;
SELECT pg_temp.assert(NOT EXISTS(SELECT FROM special_job_paper_reports WHERE source_paper_report_id=:linked_remark),'linked remark correction removes snapshot when order note absent');
SELECT set_config('request.jwt.claim.role','authenticated',false);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SET ROLE authenticated;
-- Current Dashboard prerequisite: undo reconciliation, then cancel the order.
DELETE FROM paper_transactions WHERE reference_id=:order_id AND transaction_type='OUT';
DELETE FROM paper_reports WHERE order_id=:order_id;
UPDATE orders SET paper_type=NULL,good_a3=NULL,waste_a3=NULL,reconciled_at=NULL WHERE id=:order_id;
UPDATE orders SET is_cancelled=true,is_printed=false,is_verified=false WHERE id=:order_id;
SELECT pg_temp.assert((SELECT is_cancelled FROM orders WHERE id=:order_id),'linked Order cancelled normally');
SELECT pg_temp.assert((SELECT sum(paper_used_a3)=10 FROM get_special_job_paper_month('2026-09-01')),'cancellation preserves monthly snapshot and A3 total');
SELECT pg_temp.assert(NOT EXISTS(SELECT FROM paper_reports WHERE order_id=:order_id),'reconciliation undo source cleanup unchanged');

-- Protected drill-down uses saved names, and monthly deletion leaves sources alone.
SELECT pg_temp.report('OTHER','Mint','sticky',8,2,'2026-09-11T00:00:00Z',:order_id) AS detail_source_10 \gset
SELECT pg_temp.report('OTHER2','Mint','sticky',6,0,'2026-09-11T00:00:00Z',:order_id) AS detail_source_6 \gset
UPDATE fgcode SET name='Renamed live Product' WHERE id='OTHER';
SELECT pg_temp.assert((SELECT count(*)=2 AND sum(paper_used_a3)=16 FROM get_special_job_paper_details('2026-09-01','note_based','sticky')),'detail scopes contributors to group and month');
SELECT pg_temp.assert((SELECT product_name_snapshot='Private Product' AND report_date='2026-09-11' AND paper_type='sticky' AND paper_used_a3=10 FROM get_special_job_paper_details('2026-09-01','note_based','sticky') WHERE paper_used_a3=10),'detail name/date/paper/A3 uses snapshot despite live rename');
SELECT snapshot_id AS detail_id_10 FROM get_special_job_paper_details('2026-09-01','note_based','sticky') WHERE paper_used_a3=10 \gset
SELECT snapshot_id AS detail_id_6 FROM get_special_job_paper_details('2026-09-01','note_based','sticky') WHERE paper_used_a3=6 \gset
SELECT pg_temp.assert(NOT delete_special_job_paper_snapshot(:detail_id_10,'2026-10-01'),'monthly row delete cannot target wrong selected month');
SELECT pg_temp.assert(delete_special_job_paper_snapshot(:detail_id_10,'2026-09-01'),'moderator can delete one monthly snapshot');
SELECT pg_temp.assert((SELECT paper_used_a3=6 FROM get_special_job_paper_month('2026-09-01') WHERE job_type='note_based' AND paper_type='sticky'),'deleting 10 contribution leaves aggregate 6');
SELECT pg_temp.assert(EXISTS(SELECT FROM paper_reports WHERE id=:detail_source_10) AND EXISTS(SELECT FROM orders WHERE id=:order_id),'monthly detail deletion preserves source and Order');
SELECT pg_temp.assert((SELECT count(*)=1 FROM get_special_job_paper_details('2026-09-01','note_based','sticky')),'other contributor remains');
UPDATE paper_reports SET good_a3=12,remark='Mint' WHERE id=:detail_source_10;
SELECT pg_temp.assert((SELECT sum(paper_used_a3)=6 FROM get_special_job_paper_details('2026-09-01','note_based','sticky')),'later source edit never recreates individually deleted snapshot');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
SELECT pg_temp.assert(delete_special_job_paper_snapshot(:detail_id_6,'2026-09-01'),'assistant moderator can delete one monthly snapshot');
SELECT pg_temp.report('CARD',NULL,'source-delete',8,2) AS erroneous_source \gset
SELECT pg_temp.report('CARD',NULL,'source-delete',4,0) AS unrelated_source \gset
SELECT delete_paper_reports_individually(ARRAY[:erroneous_source]::bigint[]);
SELECT pg_temp.assert(NOT EXISTS(SELECT FROM paper_reports WHERE id=:erroneous_source),'explicit erroneous source deletion removes source');
SELECT pg_temp.assert((SELECT sum(paper_used_a3)=4 FROM get_special_job_paper_details('2026-09-01','business_card','source-delete')),'erroneous deletion removes only matching monthly snapshot');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
UPDATE fgcode SET special_monthly_report_enabled=true,special_monthly_job_type='brochure' WHERE id='OTHER';
RESET ROLE;
SET ROLE postgres;
SELECT pg_temp.assert(EXISTS(SELECT FROM audit_logs WHERE changes ? 'special_monthly_report_enabled' AND changes ? 'special_monthly_job_type'),'Product metadata uses existing audit event');
DO $$ BEGIN
 BEGIN UPDATE fgcode SET special_monthly_report_enabled=true,special_monthly_job_type=NULL WHERE id='OTHER'; RAISE EXCEPTION 'null category accepted'; EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: enabled Product requires category'; END;
 BEGIN UPDATE fgcode SET special_monthly_job_type='note_based' WHERE id='OTHER'; RAISE EXCEPTION 'note Product type accepted'; EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: Product job type allowlist'; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
SET ROLE authenticated;
DO $$ BEGIN
 PERFORM pg_temp.assert(NOT public.is_user_manager(),'normal user is not weekly eligible');
 BEGIN PERFORM * FROM get_special_job_paper_details('2026-09-01','note_based','sticky'); RAISE EXCEPTION 'unauthorized detail'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: detail Product names denied server-side'; END;
 BEGIN PERFORM delete_special_job_paper_snapshot(1,'2026-09-01'); RAISE EXCEPTION 'unauthorized monthly row delete'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: monthly row delete denied server-side'; END;
 BEGIN PERFORM * FROM get_special_job_paper_month('2026-09-01'); RAISE EXCEPTION 'unauthorized export'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: export denied server-side'; END;
 BEGIN PERFORM reset_special_job_paper_month('2026-09-01'); RAISE EXCEPTION 'unauthorized reset'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: reset denied server-side'; END;
 BEGIN PERFORM delete_paper_reports_individually(ARRAY[1]::bigint[]); RAISE EXCEPTION 'unauthorized delete'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: individual delete denied'; END;
 BEGIN UPDATE fgcode SET special_monthly_report_enabled=false WHERE id='CARD'; RAISE EXCEPTION 'unauthorized Product setting'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: Product setting denied'; END;
 PERFORM pg_temp.assert((SELECT count(*)=0 FROM special_job_paper_reports WHERE report_date IS NOT NULL),'RLS hides monthly rows from user');
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
DO $$ BEGIN
 BEGIN PERFORM reset_special_job_paper_month('2026-09-01'); RAISE EXCEPTION 'admin role assumed eligible'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: admin role denied, no name inference'; END;
END $$;
RESET ROLE;
SET ROLE postgres;
DO $$ DECLARE r text; f text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  PERFORM pg_temp.assert(NOT has_table_privilege(r,'public.special_job_paper_reports','INSERT,UPDATE,DELETE,TRUNCATE'),'no direct snapshot writes: '||r);
  PERFORM pg_temp.assert(NOT has_sequence_privilege(r,'public.special_job_paper_reports_id_seq','USAGE,UPDATE'),'no inherited sequence access: '||r);
  PERFORM pg_temp.assert(NOT has_column_privilege(r,'public.special_job_paper_reports','product_id','SELECT'),'no Product provenance SELECT: '||r);
  FOREACH f IN ARRAY ARRAY['special_monthly_note_matches(text)','sync_special_job_paper_report(public.paper_reports,text,boolean)','capture_special_job_paper_report()','correct_special_job_order_note()','protect_special_monthly_product_fields()'] LOOP
   PERFORM pg_temp.assert(NOT has_function_privilege(r,'public.'||f,'EXECUTE'),'internal function denied: '||r||' '||f);
  END LOOP;
 END LOOP;
 PERFORM pg_temp.assert(NOT has_function_privilege('anon','get_special_job_paper_details(date,text,text,bigint)','EXECUTE'),'anonymous detail RPC denied');
 PERFORM pg_temp.assert(NOT has_function_privilege('anon','delete_special_job_paper_snapshot(bigint,date)','EXECUTE'),'anonymous monthly row delete denied');
 PERFORM pg_temp.assert(NOT has_column_privilege('authenticated','special_job_paper_reports','product_name_snapshot','SELECT'),'names not exposed by direct table SELECT');
 PERFORM pg_temp.assert(NOT has_function_privilege('anon','get_special_job_paper_month(date)','EXECUTE'),'anon cannot call export RPC');
 PERFORM pg_temp.assert(NOT has_function_privilege('anon','reset_special_job_paper_month(date)','EXECUTE'),'anon cannot call reset RPC');
END $$;
SELECT 'ALL LOCAL DATABASE CHECKS PASSED' AS result;
