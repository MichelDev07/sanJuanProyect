/* ============================================================
   SUPABASE — Configuración y cliente
   ============================================================

   1. Creá un proyecto en https://supabase.com
   2. Copiá la "Project URL" y la "anon public key"
      (Project Settings → API) y pegalas abajo.
   3. Ejecutá el script SQL que está al final de este archivo
      (como comentario) en el SQL Editor de Supabase para crear
      las tablas, políticas RLS y datos de ejemplo.
   ============================================================ */

const SUPABASE_URL = "https://roibyonlxyypifvpxjfg.supabase.co"; 
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvaWJ5b25seHl5cGlmdnB4amZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NzQyMjYsImV4cCI6MjA5NzQ1MDIyNn0.ITbS_ixwsdWAZ_otNbQVmxBsxQBrRd2iM84Yt6LN0oM";

// Variable global para acceso desde app.js
window.supabaseClient = null;

// Esperar a que el CDN de Supabase se cargue
async function initSupabase() {
  return new Promise((resolve) => {
    if (window.supabase && window.supabase.createClient) {
      window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      resolve(window.supabaseClient);
      return;
    }
    
    const checkInterval = setInterval(() => {
      if (window.supabase && window.supabase.createClient) {
        clearInterval(checkInterval);
        window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        resolve(window.supabaseClient);
      }
    }, 50);
    
    // Timeout de 10 segundos
    setTimeout(() => {
      clearInterval(checkInterval);
      console.error("Error: El CDN de Supabase no se cargó");
      resolve(null);
    }, 10000);
  });
}

// Inicializar cuando sea necesario
initSupabase();

/* ============================================================
   SCRIPT SQL — Ejecutar en Supabase (SQL Editor)
   ============================================================

-- ─────────────────────────────────────────────
-- 1. TABLA: profiles (datos públicos del usuario)
-- ─────────────────────────────────────────────
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text not null,
  email text not null,
  created_at timestamp with time zone default now()
);

alter table public.profiles enable row level security;

create policy "Cualquiera autenticado puede ver perfiles"
  on public.profiles for select
  to authenticated
  using (true);

create policy "El usuario puede crear su propio perfil"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "El usuario puede actualizar su propio perfil"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- Trigger: crea automáticamente el perfil al registrarse
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ─────────────────────────────────────────────
-- 2. TABLA: productos (catálogo de ventas)
-- ─────────────────────────────────────────────
create table public.productos (
  id bigint generated always as identity primary key,
  nombre text not null,
  precio numeric not null check (precio >= 0),
  created_at timestamp with time zone default now()
);

alter table public.productos enable row level security;

create policy "Todos los autenticados pueden ver productos"
  on public.productos for select
  to authenticated
  using (true);

create policy "Todos los autenticados pueden agregar productos"
  on public.productos for insert
  to authenticated
  with check (true);

insert into public.productos (nombre, precio) values
  ('Pajagua Mascada', 8000),
  ('Mbeju', 6000),
  ('Chipa Asador', 5000),
  ('Pastel Mandi''o', 4000),
  ('Sopa Paraguaya', 7000),
  ('Gaseosa', 8000),
  ('Agua Mineral', 5000);


-- ─────────────────────────────────────────────
-- 3. TABLA: gastos
-- ─────────────────────────────────────────────
create table public.gastos (
  id bigint generated always as identity primary key,
  concepto text not null,
  monto numeric not null check (monto >= 0),
  fecha date not null,
  user_id uuid references auth.users not null,
  usuario_nombre text not null,
  created_at timestamp with time zone default now()
);

alter table public.gastos enable row level security;

create policy "Todos los autenticados pueden ver gastos"
  on public.gastos for select
  to authenticated
  using (true);

create policy "Todos los autenticados pueden crear gastos"
  on public.gastos for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Todos los autenticados pueden editar gastos"
  on public.gastos for update
  to authenticated
  using (true);

create policy "Todos los autenticados pueden borrar gastos"
  on public.gastos for delete
  to authenticated
  using (true);


-- ─────────────────────────────────────────────
-- 4. TABLA: ventas
-- ─────────────────────────────────────────────
create table public.ventas (
  id bigint generated always as identity primary key,
  producto_id bigint references public.productos not null,
  producto_nombre text not null,
  cantidad integer not null check (cantidad > 0),
  precio_unitario numeric not null check (precio_unitario >= 0),
  total numeric not null check (total >= 0),
  fecha date not null,
  user_id uuid references auth.users not null,
  usuario_nombre text not null,
  created_at timestamp with time zone default now()
);

alter table public.ventas enable row level security;

create policy "Todos los autenticados pueden ver ventas"
  on public.ventas for select
  to authenticated
  using (true);

create policy "Todos los autenticados pueden crear ventas"
  on public.ventas for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Todos los autenticados pueden editar ventas"
  on public.ventas for update
  to authenticated
  using (true);

create policy "Todos los autenticados pueden borrar ventas"
  on public.ventas for delete
  to authenticated
  using (true);

   ============================================================ */