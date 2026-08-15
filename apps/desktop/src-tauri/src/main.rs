// The shell stays thin: window management and packaging only.
// All simulation logic lives in TypeScript (packages/engine).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running FabSim");
}
