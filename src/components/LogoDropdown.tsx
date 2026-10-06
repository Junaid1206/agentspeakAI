import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { Home, LogOut, UserRound } from "lucide-react";
import { useNavigate } from "react-router";

export function LogoDropdown() {
  const { isAuthenticated, signOut, user } = useAuth();
  const navigate = useNavigate();

  const displayName = user?.name?.trim() || user?.email?.split("@")[0] || "User";
  const initials = displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate("/");
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-full p-0.5"
          aria-label="Account menu"
        >
          {user?.image ? (
            <img
              src={user.image}
              alt={displayName}
              width={34}
              height={34}
              className="size-8 rounded-full object-cover"
            />
          ) : (
            <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold">
              {initials || "U"}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-2">
          <p className="truncate text-sm font-medium">{displayName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {user?.email ?? "Signed in"}
          </p>
        </div>

        <DropdownMenuSeparator />

        {isAuthenticated && (
          <DropdownMenuItem
            onClick={() => navigate("/dashboard/profile")}
            className="cursor-pointer"
          >
            <UserRound className="mr-2 h-4 w-4" />
            My Profile
          </DropdownMenuItem>
        )}

        <DropdownMenuItem onClick={() => navigate("/")} className="cursor-pointer">
          <Home className="mr-2 h-4 w-4" />
          Landing Page
        </DropdownMenuItem>

        {isAuthenticated && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="cursor-pointer text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
