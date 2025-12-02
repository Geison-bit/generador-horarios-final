// src/components/TileCard.jsx
import { Link } from "react-router-dom";

export default function TileCard({ title, description, to }) {
  return (
    <Link to={to} className="block rounded-lg sm:rounded-xl border p-4 hover:bg-gray-50">
      <div className="font-semibold">{title}</div>
      {description && <div className="text-sm text-gray-500">{description}</div>}
      <div className="mt-2 text-blue-600 text-sm">Entrar →</div>
    </Link>
  );
}

