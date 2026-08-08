import { redirect } from "next/navigation";
import { signIn } from "@/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ hiba?: string }>;
}) {
  const { hiba } = await searchParams;

  async function login(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirect: false,
      });
    } catch {
      redirect("/login?hiba=1");
    }
    redirect("/");
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="card w-full max-w-[380px] p-8 flex flex-col gap-4">
        <div>
          <h1 className="text-[24px]">Számlakezelő</h1>
          <p className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
            Jelentkezz be a folytatáshoz
          </p>
        </div>
        {hiba && (
          <p className="badge" style={{ background: "var(--red-bg)", color: "var(--red)" }}>
            Hibás e-mail cím vagy jelszó
          </p>
        )}
        <form action={login} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="label-upper">E-mail</span>
            <input name="email" type="email" required className="input" placeholder="demo@grafium.hu" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-upper">Jelszó</span>
            <input name="password" type="password" required className="input" placeholder="demo1234" />
          </label>
          <button type="submit" className="btn-primary justify-center">Bejelentkezés</button>
        </form>
        <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
          Demó fiók: demo@grafium.hu / demo1234
        </p>
      </div>
    </main>
  );
}
