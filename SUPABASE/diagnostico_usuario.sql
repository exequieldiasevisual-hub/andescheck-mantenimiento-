select id, email, encrypted_password is not null as tiene_password, email_confirmed_at, confirmed_at,
       aud, role, banned_until, is_sso_user, is_anonymous, instance_id
from auth.users
where email = 'edias@lb.andescheck.internal';
