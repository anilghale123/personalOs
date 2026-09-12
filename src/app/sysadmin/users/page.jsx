import { getAdminActor } from "@/features/admin/guard";
import { listUsers } from "@/features/admin/analytics";
import { UserTable } from "@/features/admin/components/user-table";
import { ROLE_ORDER, assignableRoles } from "@/lib/roles";

export const dynamic = "force-dynamic";

export const metadata = { title: "Users · Admin" };

const PAGE_SIZE = 25;

export default async function UsersPage({ searchParams }) {
  const params = await searchParams;
  const q = typeof params?.q === "string" ? params.q : "";
  const role = ROLE_ORDER.includes(params?.role) ? params.role : "";
  const page = Math.max(1, Number(params?.page) || 1);

  const [actor, data] = await Promise.all([
    getAdminActor(),
    listUsers({ q, role, limit: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }),
  ]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-2xl tracking-tight">Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {data.total} {data.total === 1 ? "account" : "accounts"}. You can only
          manage accounts with a lower role than your own.
        </p>
      </header>

      <UserTable
        initial={data}
        actorId={actor.id}
        actorRole={actor.role}
        assignable={assignableRoles(actor.role)}
        query={{ q, role, page }}
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}
