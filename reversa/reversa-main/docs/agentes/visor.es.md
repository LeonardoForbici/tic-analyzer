# Visor

**Comando:** `/reversa-visor`
**Fase:** Cualquiera

---

## 🖼️ El ilustrador forense

El ilustrador forense trabaja solo con imágenes. Recibe screenshots del sistema y reconstruye fielmente la interfaz: pantallas, formularios, flujos de navegación. No necesita que el sistema esté en ejecución. Solo las fotos.

---

## Qué hace

El ilustrador forense trabaja solo con imágenes. Le envías screenshots y él reconstruye fielmente lo que hay: pantallas, formularios, flujos de navegación, estados de interfaz. El sistema no necesita estar corriendo. Solo las fotos.

!!! info "Requiere soporte de imágenes"
    Visor solo funciona con modelos que aceptan imágenes como entrada. Claude, GPT-4o y Gemini lo soportan.

---

## Qué produce

| Archivo | Contenido |
|---------|-----------|
| `_reversa_sdd/ui/inventory.md` | Inventario completo de pantallas |
| `_reversa_sdd/ui/flow.md` | Flujo de navegación en Mermaid |
| `_reversa_sdd/ui/screens/[nombre-pantalla].md` | Spec detallada por pantalla |
