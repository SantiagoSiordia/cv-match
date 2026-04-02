import { redirect } from "next/navigation";

/** Skip the marketing-style landing page; go straight to the CV library. */
export default function Home() {
  redirect("/cvs");
}
