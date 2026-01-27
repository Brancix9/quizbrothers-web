from PIL import Image
import os
import glob

# Priečinok kde sú fotky
folder = "2023"

# Nájdi všetky jpg súbory
jpg_files = glob.glob(f"{folder}/*.jpg") + glob.glob(f"{folder}/*.JPG") + glob.glob(f"{folder}/*.jpeg") + glob.glob(f"{folder}/*.JPEG")

print(f"Našiel som {len(jpg_files)} jpg súborov na konverziu")

for jpg_file in jpg_files:
    # Vytvor webp názov súboru
    webp_file = os.path.splitext(jpg_file)[0].lower() + ".webp"
    
    try:
        # Otvor obrázok
        img = Image.open(jpg_file)
        
        # Ulož ako WebP s kvalitou 85% (dobrý kompromis medzi kvalitou a veľkosťou)
        img.save(webp_file, "WEBP", quality=85)
        
        # Získaj veľkosti súborov
        original_size = os.path.getsize(jpg_file) / 1024  # v KB
        webp_size = os.path.getsize(webp_file) / 1024  # v KB
        saved = ((original_size - webp_size) / original_size) * 100
        
        print(f"✅ {os.path.basename(jpg_file)} -> {os.path.basename(webp_file)}")
        print(f"   Originál: {original_size:.1f} KB | WebP: {webp_size:.1f} KB | Ušetrené: {saved:.1f}%")
        
    except Exception as e:
        print(f"❌ Chyba pri konverzii {jpg_file}: {e}")

print("\n🎉 Konverzia dokončená!")
