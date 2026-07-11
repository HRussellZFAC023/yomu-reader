import os
import sys
import urllib.request
import urllib.parse
import time
from PIL import Image

def resize_and_crop(image_path, output_path, target_width=1024, target_height=1280):
    try:
        img = Image.open(image_path)
        img_width, img_height = img.size
        
        target_ratio = target_width / target_height
        img_ratio = img_width / img_height
        
        if img_ratio > target_ratio:
            # Image is wider than target ratio - match height, crop sides
            new_height = target_height
            new_width = int(img_width * (target_height / img_height))
            resized_img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
            
            # Crop horizontally centered
            left = (new_width - target_width) // 2
            right = left + target_width
            final_img = resized_img.crop((left, 0, right, target_height))
        else:
            # Image is taller than target ratio - match width, crop top/bottom
            new_width = target_width
            new_height = int(img_height * (target_width / img_width))
            resized_img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
            
            # Crop vertically centered
            top = (new_height - target_height) // 2
            bottom = top + target_height
            final_img = resized_img.crop((0, top, target_width, bottom))
            
        final_img.save(output_path, "PNG")
        print(f"Successfully processed and saved to {output_path} ({target_width}x{target_height})")
    except Exception as e:
        print(f"Error processing {image_path}: {e}")
        sys.exit(1)

STYLE_SUFIX = (
    " Style is warm hand-painted anime with soft 32-bit pixel grain, not photoreal, "
    "clean detailed anime lineart, warm skin tones, soft color shading. Background: a school "
    "classroom at blue hour/dusk. A window showing deep blue/purple twilight sky and distant "
    "warm city lights. Inside, desk, chalkboard with notes, bookshelves, and a desk lamp casting "
    "warm orange light on the character's side. Lighting: warm yellow/orange glow on the side "
    "from the indoor light source, contrasting with the cool blue-hour ambient light. No text, "
    "no watermarks, no logos."
)

CHARACTERS = {
    "angel": (
        "A game cast portrait, chest-up 3/4 bust of angel: an East/Southeast-Asian woman, "
        "roughly 30s, long straight dark-brown hair with a centre parting, a big warm genuine smile, "
        "wearing a navy top. She looks sharp and organised, with a tech background, but is warm and approachable."
    ),
    "stasi": (
        "A game cast portrait, chest-up 3/4 bust of stasi: a woman with vibrant RED/auburn wavy "
        "shoulder-length hair, round glasses, a warm open smile, artsy/expressive student energy, "
        "wearing a cosy scarf. Bright and creative."
    ),
    "ruparna": (
        "A game cast portrait, chest-up 3/4 bust of ruparna: a South-Asian woman with long dark hair, "
        "a gentle thoughtful expression, quietly observant, with a bookish, film-loving calm."
    ),
    "pho": (
        "A game cast portrait, chest-up 3/4 bust of pho: a young Southeast-Asian woman with long black hair, "
        "a relaxed carefree easy grin, casual and warm, looking unbothered, funny, far from home but light about it."
    )
}

def generate_all():
    os.makedirs("public/academy/art/characters/portraits", exist_ok=True)
    temp_dir = "public/academy/art/characters/portraits/temp"
    os.makedirs(temp_dir, exist_ok=True)
    
    seeds = {
        "angel": 4218,
        "stasi": 8833,
        "ruparna": 1955,
        "pho": 7330
    }
    
    for idx, (char_id, desc) in enumerate(CHARACTERS.items()):
        if idx > 0:
            print("Waiting 10 seconds to allow the queue to clear for the next generation...")
            time.sleep(10)
            
        prompt = f"{desc}{STYLE_SUFIX}"
        encoded_prompt = urllib.parse.quote(prompt)
        seed = seeds[char_id]
        
        # We specify model=sana as it is the currently active/available model and won't throw 429
        url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width=768&height=1024&model=sana&nologo=true&seed={seed}"
        
        temp_file = os.path.join(temp_dir, f"{char_id}_temp.jpg")
        final_file = f"public/academy/art/characters/portraits/{char_id}.png"
        
        print(f"Generating portrait for {char_id} (seed {seed})...")
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=120) as response:
                data = response.read()
                with open(temp_file, "wb") as f:
                    f.write(data)
            
            # Post-process (resize, crop, convert to PNG)
            resize_and_crop(temp_file, final_file)
            
            # Clean up temp file
            if os.path.exists(temp_file):
                os.remove(temp_file)
        except Exception as e:
            print(f"Failed to generate {char_id}: {e}")
            
    # Clean up temp dir
    try:
        os.rmdir(temp_dir)
    except Exception:
        pass

if __name__ == "__main__":
    generate_all()
