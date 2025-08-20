import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Home } from "lucide-react";

const NotFound = () => {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Card className="p-8 max-w-md text-center">
        <div className="mb-6">
          <h1 className="text-6xl font-bold text-muted-foreground mb-2">404</h1>
          <h2 className="text-title mb-4">Page Not Found</h2>
          <p className="text-body text-muted-foreground">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>
        
        <Button asChild className="bg-gradient-brand hover:opacity-90 text-brand-foreground">
          <Link to="/" className="flex items-center gap-2">
            <Home size={16} />
            Back to Home
          </Link>
        </Button>
      </Card>
    </div>
  );
};

export default NotFound;
