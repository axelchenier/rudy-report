# Supabase setup (one time, ~3 minutes)

1. Open your project at https://supabase.com/dashboard.
2. **SQL Editor** (left sidebar) > **New query** > paste all of `supabase/schema.sql` > **Run**. You should see "Success".
3. **Authentication > URL Configuration**:
   - Site URL: `https://axelchenier.github.io/rudy-report/`
   - Redirect URLs > Add URL: `https://axelchenier.github.io/rudy-report/`
   - Save.
4. **Authentication > Sign In / Providers > Email**: make sure it is enabled.
5. On the site, click the 👤 button, sign up, confirm via the email link, then sign in. Your saves and big board now sync.
