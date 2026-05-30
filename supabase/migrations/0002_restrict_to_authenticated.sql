-- 비로그인(anon) 접근 차단, 로그인(authenticated)만 허용.
-- 가입을 막아 계정이 하나뿐이면 사실상 1인 전용이 된다.
drop policy if exists "public_select_sales_records" on public.sales_records;
drop policy if exists "public_insert_sales_records" on public.sales_records;
drop policy if exists "public_update_sales_records" on public.sales_records;
drop policy if exists "public_delete_sales_records" on public.sales_records;

create policy "auth_select_sales_records" on public.sales_records for select to authenticated using (true);
create policy "auth_insert_sales_records" on public.sales_records for insert to authenticated with check (true);
create policy "auth_update_sales_records" on public.sales_records for update to authenticated using (true) with check (true);
create policy "auth_delete_sales_records" on public.sales_records for delete to authenticated using (true);
