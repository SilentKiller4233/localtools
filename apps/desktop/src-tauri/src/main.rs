//! Thin binary entry — all logic lives in the library (lib.rs) so
//! `cargo test` exercises exactly what ships.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    localtools_desktop::run();
}
