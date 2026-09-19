// test-delete.js (à la racine du projet backend)
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function test() {
  // 1. Liste d'abord le contenu du dossier pour voir le NOM EXACT stocké
  const { data: listData, error: listError } = await supabase.storage
    .from("chat-files")
    .list("images");

  console.log("=== LISTE DES FICHIERS ===");
  console.log(JSON.stringify(listData, null, 2));
  console.log("Erreur liste:", listError);

  // 2. Tente la suppression avec le path exact
  const { data, error } = await supabase.storage
    .from("chat-files")
    .remove(["images/ae0a10c1-d0b5-4451-842e-ad9b4736e072.jpg"]);

  console.log("=== SUPPRESSION ===");
  console.log("data:", JSON.stringify(data, null, 2));
  console.log("error:", error);
}

test();
