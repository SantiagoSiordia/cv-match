import { redirect } from "next/navigation";

/** Skip the marketing-style landing page; go straight to evaluation. */
export default function Home() {
  redirect("/evaluate");
}
