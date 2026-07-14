# このデータセットについて

Rosebleuブランドの代表を務められていた青猫様にご提供いただいた、 解散したRosebleuブランドのゲームタイトルのうち、権利譲渡等を行っていない10タイトルについてのシナリオから作成したデータセットです。JSONL形式になっています。主には大規模言語モデルのファインチューニング用途を想定していますが、LICENSEに違反しない用途ならばどんな用途でも問題ありません。

https://ja.wikipedia.org/wiki/Rosebleu

# ライセンス

「学習用データセットに加工したものは、自由に配布頂いてかまいません。 利用目的について営利・非営利の制限は不要です。」という内容でお預かりしたので、APACHE LICENSE, VERSION 2.0とします。
(C)Rosebleu

# アダルトシーンの区別

成人向け美少女ゲームのシナリオから生成されているため、一部、セクシャルな描写を含むテキストが存在します。当該の描写を含むテキストには、ファイル名に「～h.txt」のようなプレフィックスが付いています。 もし除外や区別される場合は参考にしてください。

# データセットの構成

各JSONLファイルは以下の様に、index, speaker, utteranceの3つの要素があります。

```json lines
{"index": 0, "speaker": "ハイレン", "utterance": "それで、いよいよ明日からか"}
{"index": 1, "speaker": "主人公", "utterance": "街からわずかに離れた泉の前。俺の眼前には、一組の男女が立っていた。"}
{"index": 2, "speaker": "主人公", "utterance": "どちらも神に選ばれた、と言っても言いすぎではないだろう端正な顔立ちに、金色の髪。こうしてただ目の前にいるだけなのに、輝いているかのようなオーラを感じる。"}

```

indexは、そのシナリオ中での発話の順番を表します。speakerは、発話者を表します。utteranceは、発話内容を表します。

schemaは以下です。

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Game Scenario JSONL Schema",
  "description": "Schema for the JSONL representation of game scenario dialogues.",
  "type": "object",
  "properties": {
    "index": {
      "description": "The line number or index of the dialogue in the original game scenario file.",
      "type": "integer"
    },
    "speaker": {
      "description": "The name of the character or entity speaking the line.",
      "type": "string"
    },
    "utterance": {
      "description": "The actual dialogue or narration spoken by the speaker.",
      "type": "string"
    }
  },
  "required": ["index", "speaker", "utterance"]
}

```

シンプルなTSVファイルも同梱しています。

# 元タイトル

- 2009年6月26日 - Stellar☆Theater
- 2010年6月25日 - Tiny Dungeon 〜BLACK and WHITE〜
- 2010年12月24日 - Tiny Dungeon 〜BLESS of DRAGON〜
- 2011年6月24日 - Stellar☆Theater encore
- 2011年7月29日 - Tiny Dungeon 〜BIRTH for YOURS〜
- 2012年7月27日 - Tiny Dungeon 〜BRAVE or SLAVE〜
- 2013年2月28日 - いんぴゅり〜ヒトとアナタとアヤカシと〜
- 2014年3月28日 - Endless Dungeon
- 2014年9月26日 - 世界を救うだけの簡単なお仕事
- 2015年3月27日 - 戦乙女らんなばうとっ!
