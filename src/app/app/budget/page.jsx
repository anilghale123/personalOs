import { redirect } from "next/navigation";

export default function BudgetIndexPage() {
  redirect("/app/budget/expenses");
}
