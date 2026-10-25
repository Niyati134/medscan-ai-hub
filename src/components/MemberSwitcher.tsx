import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { ChevronDown, User, Users, Plus, Check } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { listFamilyMembers, type FamilyMember } from "@/lib/family.functions";
import { useMember } from "@/lib/useMember";
import { useAuth } from "@/lib/useAuth";

function initials(name?: string | null) {
  if (!name) return "U";
  return name
    .split(/[\s@]/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function MemberSwitcher() {
  const { user } = useAuth();
  const { activeMemberId, setActiveMemberId } = useMember();
  const fetchFn = useServerFn(listFamilyMembers);
  const { data: members = [] } = useQuery({
    queryKey: ["family-members"],
    queryFn: () => fetchFn(),
  });

  const active = activeMemberId
    ? members.find((m) => m.id === activeMemberId)
    : null;

  const displayName = active?.name ?? user?.email?.split("@")[0] ?? "Myself";
  const sub = active?.relationship ?? "Account owner";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-11 gap-2 rounded-xl border border-border/60 bg-card/60 px-2.5 hover:bg-accent"
        >
          <Avatar className="h-7 w-7">
            {active?.avatar_url && <AvatarImage src={active.avatar_url} />}
            <AvatarFallback className="bg-gradient-primary text-[10px] font-bold text-primary-foreground">
              {initials(displayName)}
            </AvatarFallback>
          </Avatar>
          <div className="hidden text-left sm:block">
            <p className="text-xs font-semibold leading-tight">{displayName}</p>
            <p className="text-[10px] leading-tight text-muted-foreground">{sub}</p>
          </div>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <Users className="h-3 w-3" /> Active profile
        </DropdownMenuLabel>
        <DropdownMenuItem onClick={() => setActiveMemberId(null)} className="gap-2">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-gradient-primary text-[10px] text-primary-foreground">
              {initials(user?.email)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <p className="text-sm font-medium">Myself</p>
            <p className="text-[10px] text-muted-foreground">Account owner</p>
          </div>
          {activeMemberId === null && <Check className="h-4 w-4 text-primary" />}
        </DropdownMenuItem>
        {members.map((m: FamilyMember) => (
          <DropdownMenuItem
            key={m.id}
            onClick={() => setActiveMemberId(m.id)}
            className="gap-2"
          >
            <Avatar className="h-7 w-7">
              {m.avatar_url && <AvatarImage src={m.avatar_url} />}
              <AvatarFallback className="bg-secondary text-[10px]">
                {initials(m.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <p className="text-sm font-medium">{m.name}</p>
              <p className="text-[10px] text-muted-foreground">{m.relationship}</p>
            </div>
            {activeMemberId === m.id && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/family" className="gap-2">
            <Plus className="h-4 w-4" />
            <span>Manage family</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
