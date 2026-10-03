package app.luciferfx.share;
import org.json.*;
import java.util.*;
final class FxModelPolicy {
 static void invalid(String message)throws Exception{throw new FxRuntime.ApiError(400,"model_capability",message);}
 static void validate(JSONObject payload)throws Exception {
  JSONObject b=payload.getJSONObject("novelai").getJSONObject("body"),p=b.getJSONObject("parameters");String model=b.optString("model"),base=model.replace("-inpainting",""),action=b.optString("action","generate");boolean v45=base.startsWith("nai-diffusion-4-5-");
  if(!Arrays.asList("nai-diffusion-5-full","nai-diffusion-4-5-full","nai-diffusion-4-5-curated").contains(base)||!base.equals(payload.optString("model")))invalid("内外层模型不一致或模型不支持");
  if(!Arrays.asList("generate","img2img","infill").contains(action)||!model.equals(action.equals("infill")?base+"-inpainting":base))invalid("生成模式与模型不匹配");
  Iterator<String> fields=p.keys();while(fields.hasNext()){String k=fields.next();if(v45?Arrays.asList("tag_hint_transparent_background","tag_hint_qt","tag_hint_uc_preset").contains(k):k.matches("^(reference_|director_reference_|normalize_reference_strength).*|characterRef|skip_cfg_above_sigma"))invalid("该模型不支持参数 "+k);}
  JSONArray precise=p.optJSONArray("director_reference_images"),vibes=p.optJSONArray("reference_image_multiple");if(precise!=null&&precise.length()>0&&(vibes!=null&&vibes.length()>0||!p.optString("reference_image").isEmpty()))invalid("精准参考与 Vibe 不可同时使用");
  for(String name:new String[]{"director_reference_images","reference_image_multiple"}){if(p.has(name)&&!(p.get(name) instanceof JSONArray))invalid("参考图必须为数组");JSONArray images=p.optJSONArray(name);if(images==null)continue;if(images.length()>16)invalid("最多使用 16 张参考图");String[] aligned=name.startsWith("director")?new String[]{"director_reference_descriptions","director_reference_information_extracted","director_reference_strength_values","director_reference_secondary_strength_values"}:new String[]{"reference_strength_multiple"};for(String field:aligned)if(images.length()>0&&(p.optJSONArray(field)==null||p.getJSONArray(field).length()!=images.length()))invalid("参考图参数数量不一致");}
  for(String field:new String[]{"v4_prompt","v4_negative_prompt"}){JSONObject prompt=p.optJSONObject(field);if(prompt==null||prompt.optJSONObject("caption")==null)continue;JSONArray chars=prompt.getJSONObject("caption").optJSONArray("char_captions");if(chars==null)continue;if(chars.length()>(v45?6:32))invalid("角色数量超过模型上限");if(v45&&prompt.optBoolean("use_coords"))for(int i=0;i<chars.length();i++){JSONArray centers=chars.getJSONObject(i).optJSONArray("centers");if(centers==null)continue;for(int j=0;j<centers.length();j++)for(String axis:new String[]{"x","y"}){double v=centers.getJSONObject(j).optDouble(axis),grid=(v-.1)/.2;if(!Double.isFinite(v)||v<.1-1e-8||v>.9+1e-8||Math.abs(grid-Math.round(grid))>1e-7)invalid("V4.5 角色位置需要 5×5 网格");}}}
 }
}
