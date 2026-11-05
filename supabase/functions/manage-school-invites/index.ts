import { createClient, type User } from "https://esm.sh/@supabase/supabase-js@2.118.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type StaffRole = "teacher" | "life_supervisor" | "class_delegate";
type InviteBody =
  | { action: "invite"; school_id: string; email: string; role: StaffRole; class_id?: string | null }
  | { action: "revoke"; school_id: string; invitation_id: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function readNamedKey(variable: string, fallbackVariable: string, fallbackScalar: string) {
  const raw = Deno.env.get(variable);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, string>;
      if (typeof parsed.default === "string" && parsed.default.length > 0) return parsed.default;
    } catch {
      if (!raw.trim().startsWith("{")) return raw.trim();
    }
  }
  return Deno.env.get(fallbackVariable) ?? Deno.env.get(fallbackScalar) ?? "";
}

function readBody(value: unknown): InviteBody | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;

  if (body.action === "revoke") {
    if (typeof body.school_id !== "string" || typeof body.invitation_id !== "string") return null;
    return { action: "revoke", school_id: body.school_id, invitation_id: body.invitation_id };
  }

  if (body.action === "invite") {
    if (
      typeof body.school_id !== "string" ||
      typeof body.email !== "string" ||
      !["teacher", "life_supervisor", "class_delegate"].includes(String(body.role))
    ) return null;

    const classId = typeof body.class_id === "string" && body.class_id.length > 0 ? body.class_id : null;
    const role = body.role as StaffRole;
    if ((role === "life_supervisor" && classId !== null) || (role !== "life_supervisor" && classId === null)) {
      return null;
    }

    return { action: "invite", school_id: body.school_id, email: body.email.trim().toLowerCase(), role, class_id: classId };
  }
  return null;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const publishableKey = readNamedKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY");
    const secretKey = readNamedKey("SUPABASE_SECRET_KEYS", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !publishableKey || !secretKey) {
      return json({ error: "La configuration serveur Supabase est incomplète." }, 500);
    }

    const authorization = request.headers.get("Authorization") ?? "";
    const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!accessToken) return json({ error: "Connexion requise." }, 401);

    const userClient = createClient(supabaseUrl, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: "Bearer " + accessToken } },
    });
    const adminClient = createClient(supabaseUrl, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser(accessToken);
    if (authError || !authData.user || !authData.user.email) {
      return json({ error: "Session invalide ou adresse e-mail indisponible." }, 401);
    }
    const actor = authData.user;

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return json({ error: "Corps de requête JSON invalide." }, 400);
    }

    const body = readBody(rawBody);
    if (!body) return json({ error: "Les paramètres de l’opération sont incomplets ou invalides." }, 400);

    const { data: adminMembership, error: membershipError } = await userClient
      .from("school_members")
      .select("id, role")
      .eq("school_id", body.school_id)
      .eq("user_id", actor.id)
      .eq("is_active", true)
      .in("role", ["school_admin", "super_admin"])
      .limit(1)
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (!adminMembership) {
      return json({ error: "Seule la direction de cet établissement peut gérer les invitations." }, 403);
    }

    if (body.action === "revoke") {
      const { data, error } = await adminClient
        .from("school_invitations")
        .update({ status: "revoked" })
        .eq("id", body.invitation_id)
        .eq("school_id", body.school_id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!data) return json({ error: "Cette invitation n’est plus en attente." }, 409);
      return json({ success: true, status: "revoked" });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) || body.email.length > 254) {
      return json({ error: "Adresse e-mail invalide." }, 400);
    }

    if (body.class_id) {
      const { data: schoolClass, error } = await userClient
        .from("classes")
        .select("id")
        .eq("id", body.class_id)
        .eq("school_id", body.school_id)
        .maybeSingle();
      if (error) throw error;
      if (!schoolClass) return json({ error: "La classe choisie n’appartient pas à cet établissement." }, 400);
    }

    const { data: invitation, error: invitationError } = await adminClient
      .from("school_invitations")
      .insert({
        school_id: body.school_id,
        email: body.email,
        role: body.role,
        class_id: body.class_id,
        created_by: actor.id,
      })
      .select("id")
      .single();

    if (invitationError) {
      if (invitationError.code === "23505") {
        return json({ error: "Une invitation identique est déjà en attente pour cette adresse." }, 409);
      }
      throw invitationError;
    }

    let existingUser: User | null = null;
    let userDirectoryComplete = false;
    for (let page = 1; page <= 20; page += 1) {
      const { data: usersPage, error: usersError } = await adminClient.auth.admin.listUsers({
        page,
        perPage: 1000,
      });
      if (usersError) throw usersError;
      existingUser = usersPage.users.find((candidate) => candidate.email?.toLowerCase() === body.email) ?? null;
      if (existingUser || usersPage.users.length < 1000) {
        userDirectoryComplete = true;
        break;
      }
    }
    if (!userDirectoryComplete) {
      throw new Error("La recherche du compte dépasse la limite de sécurité.");
    }

    if (existingUser && !existingUser.email_confirmed_at) {
      await adminClient.from("school_invitations").delete().eq("id", invitation.id);
      return json({
        error: "Ce compte existe déjà mais son adresse e-mail n’est pas confirmée. Demandez à la personne de confirmer son adresse avant de l’ajouter.",
      }, 409);
    }

    if (existingUser) {
      const { error: memberError } = await adminClient
        .from("school_members")
        .upsert({
          school_id: body.school_id,
          user_id: existingUser.id,
          role: body.role,
          is_active: true,
        }, { onConflict: "school_id,user_id,role" });
      if (memberError) throw memberError;

      if (body.class_id) {
        const { error: assignmentError } = await adminClient
          .from("class_assignments")
          .upsert({
            school_id: body.school_id,
            class_id: body.class_id,
            user_id: existingUser.id,
            role: body.role,
            assigned_by: actor.id,
          }, { onConflict: "school_id,class_id,user_id,role" });
        if (assignmentError) throw assignmentError;
      }

      const { error: acceptedError } = await adminClient
        .from("school_invitations")
        .update({
          status: "accepted",
          accepted_user_id: existingUser.id,
          accepted_at: new Date().toISOString(),
        })
        .eq("id", invitation.id);
      if (acceptedError) throw acceptedError;

      return json({
        success: true,
        status: "assigned",
        email: body.email,
        message: "Le compte existant a été ajouté à l’établissement.",
      });
    }

    const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(body.email);
    if (inviteError) {
      await adminClient.from("school_invitations").delete().eq("id", invitation.id);
      return json({ error: inviteError.message }, 400);
    }

    return json({
      success: true,
      status: "invited",
      email: body.email,
      message: "Invitation envoyée. Le rôle sera activé à la création du compte.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Une erreur interne est survenue.";
    console.error("manage-school-invites:", message);
    return json({ error: "Impossible de traiter cette demande. Vérifiez la configuration et réessayez." }, 500);
  }
});