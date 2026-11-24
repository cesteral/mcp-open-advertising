# Contract bump: definitionHash movement (#235, #248)

324 tools. **135 governed** (carry `annotations.cesteral`) and **86 ungoverned** hashes moved; 103 are unchanged. Hashes are the canonical SHA-256 in `scripts/lib/tool-definition-hashes.snapshot.json` (`@cesteral/contract-hash`), the same value a release manifest carries as `definitionHash`. Old = `main` at the merge base, new = this branch.

Causes (tools per cause set): hints 199, hints+outputSchema 15, outputSchema 7.

The governance repo must admit every governed new hash below and rerun enforcement verification against them before a release tag.

## Verification ledger demotions

None. `packages/amazon-dsp-mcp/verification.json` (6 entries) and `packages/ttd-mcp/verification.json` (7 entries) hold only `declared` entries, with no `verifiedDefinitionHash`, so there is nothing above `declared` to demote. No other package has a ledger.

## Breaking output-field changes

Tool outputs (no aliases kept). "Added" are non-breaking.

| Tool                                                                                                                                                                               | Removed / renamed                                                                                   | Added                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `cm360_bulk_create_entities`                                                                                                                                                       | `created` → `successCount`; `failed` → `failureCount`                                               |                                               |
| `cm360_bulk_update_entities`, `cm360_bulk_update_status`                                                                                                                           | `updated` → `successCount`; `failed` → `failureCount`                                               |                                               |
| `msads_bulk_create_entities`, `msads_bulk_update_entities`                                                                                                                         |                                                                                                     | `successCount`, `failureCount`                |
| `msads_delete_entity`                                                                                                                                                              | `result` → `response`; `deletedCount` → `successCount`; `failedCount` → `failureCount`              | `results[]`, `totalRequested`                 |
| `msads_adjust_bids`                                                                                                                                                                | `result` → `response`; `result.adjustmentResults` → `results`; `adjustmentCount` → `totalRequested` | `successCount`, `failureCount`                |
| `ttd_bulk_manage_bid_lists`                                                                                                                                                        | `succeeded` → `successCount`; `failed` → `failureCount`                                             |                                               |
| `amazon_dsp_adjust_bids`, `gads_adjust_bids`, `linkedin_adjust_bids`, `meta_adjust_bids`, `pinterest_adjust_bids`, `snapchat_adjust_bids`, `tiktok_adjust_bids`, `ttd_adjust_bids` | `totalSucceeded` → `successCount`; `totalFailed` → `failureCount`                                   |                                               |
| `dv360_adjust_line_item_bids`                                                                                                                                                      | `totalSuccessful` → `successCount`; `totalFailed` → `failureCount`                                  | `results[]` (`successful[]`, `failed[]` kept) |
| `amazon_dsp_delete_entity`                                                                                                                                                         | `totalSucceeded` → `successCount`; `totalFailed` → `failureCount`                                   |                                               |
| `pinterest_delete_entity`, `snapchat_delete_entity`                                                                                                                                | `succeededCount` → `successCount`; `failedCount` → `failureCount`                                   |                                               |
| `tiktok_delete_entity`                                                                                                                                                             |                                                                                                     | `results[]`, `successCount`, `failureCount`   |

Hints also change on 214 tools (see `docs/architecture/tool-hints.md`). All 13 servers take a semver major (package.json and server.json); `@cesteral/contract-schema`, `@cesteral/contract-hash` and `@cesteral/shared` are unchanged in shape and version (the shared change is test-support only: two testkit options removed).

## Governed tools

#### amazon-dsp-mcp (14)

| Tool                              | Old hash                                                           | New hash                                                           | What moved                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `amazon_dsp_get_entity`           | `4ae33a08c7167dc4678b1fa5c89b576420001d22149241b08a0e7f44b8c16814` | `1e5636acb0b34af821c6a5226c2dcda21775e4cca7a45ae6e05c30889d6a8257` | hints: openWorld F→T                                                                                        |
| `amazon_dsp_create_entity`        | `fe029901d74132ee0a64000443bf24941e51f60f2ff1cb8c1c62f939feefb235` | `4bc00a56db60d8afe154b3e5ec02dbfc00f56a712191ede2a0d3061e991d8ce5` | hints: destructive T→F, openWorld F→T                                                                       |
| `amazon_dsp_update_entity`        | `1c026178ea57caa94f675f0c6fcd0b6a1d6e8bc9f17da60cfa107b79c91995f2` | `c29cf6e7dc52ce97c80c128434f31ccdd45219c91fb0852a372e16f3353e6860` | hints: destructive F→T, openWorld F→T                                                                       |
| `amazon_dsp_delete_entity`        | `8961888637a438c7b443636854357806aa58754b8f3f4dbd22fc44a7e7facb47` | `b8e5e6d67ba176bc09dd1a4265b2f863e803640e473aa99899db7ad2e0c2a90a` | hints: idempotent F→T, openWorld F→T; outputSchema −totalSucceeded,−totalFailed +successCount,+failureCount |
| `amazon_dsp_submit_report`        | `ac22aa0a3bc3bccbf9c3b1d8ff38796511f914dc0c29be1c8fec5841e64f7896` | `92ebf30bffe6e7f532962b732babc1298c199045bb79cd9b6419ddcb77756943` | hints: openWorld F→T                                                                                        |
| `amazon_dsp_bulk_update_status`   | `b3895ee8843eee695ff83cd3d9634b3cbb95fb6aa9d83240838603dff1c6bffd` | `217d5af5b87cf5cbd670ab3ae16e5b78b087b1d8bed0daab23b93e0d69c81a11` | hints: destructive F→T, openWorld F→T                                                                       |
| `amazon_dsp_bulk_create_entities` | `657773abb4fe2ce3a591f3f008c595b64a69c7fde1303cffaba5d3c81eef4211` | `7ad1ff4e368e11ff3e852ce62ff9ac54fae2dbd5def1a2372010715a5cfcc657` | hints: destructive T→F, openWorld F→T                                                                       |
| `amazon_dsp_bulk_update_entities` | `1329d705c02ef3e436d70ffbe58a6136d6eed006422a0bfddf05c2bb1df59f8e` | `fe934d731f1891ea2a173b6a11869fa3bf8b284f0e3e7d2dac92f5bb1433d235` | hints: destructive F→T, openWorld F→T                                                                       |
| `amazon_dsp_adjust_bids`          | `7d270ddd8b331db8e9a86350604fc08df105d431ea9a08cbc04dfb83c505e7a1` | `25ff98ecf154adacf3de946958879da61510920adf5173a17982f5171e483e4f` | hints: openWorld F→T; outputSchema −totalSucceeded,−totalFailed +successCount,+failureCount                 |
| `amazon_dsp_duplicate_entity`     | `6ed7509e2c5ff36bbf402ebcc8ab67cb8edae10a65499dc245b3f30813d70217` | `6cd84cd6df3c4d2c1d561ce9ec72346c182a6dd3c38476f02a6a9dd3f0b8a812` | hints: openWorld F→T                                                                                        |
| `amazon_dsp_upload_video`         | `6e886ef320d9d7ff138327cb0bd4a7a2f43de40647e700593e61a7349da1e553` | `4f7dc15319f8262db092da34b493d53a399202ded4c6625cdd6f84def4cc4aaf` | hints: destructive T→F                                                                                      |
| `amazon_dsp_get_commitment`       | `d6dd6853c66e1a742c029290e93967a944c864bd743f92e6bb2e9d4c21d5651b` | `ad74c80a3e39b79ca29e717172ef7de9c81c91cec2d4075fcbe541fbb3b7f1c7` | hints: openWorld F→T                                                                                        |
| `amazon_dsp_create_commitment`    | `d5ff42e997b5fd3b4f4a06c3630e6ab79399b1c065a723cf392d02d04177208d` | `52de112522ffbef0a15ddb5bb09e6597d5709daa19e5729cc95e48762e64be0e` | hints: destructive T→F, openWorld F→T                                                                       |
| `amazon_dsp_update_commitment`    | `4effbecfa9419c86b297fcac5d7e2e671ae23703682d95d0b19d3ff338b20dd8` | `b80c75f4bc29f495c70e77026967c1638cf308d4f4c618d8766a3da671621461` | hints: destructive F→T, openWorld F→T                                                                       |

#### cm360-mcp (4)

| Tool                         | Old hash                                                           | New hash                                                           | What moved                                                                        |
| ---------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `cm360_create_entity`        | `52106624e95f39109dc2dc603d6940bcd0328403c5f49ffabeb75bff193c348a` | `83b73a0cee8cd6e0dec1bfd4fc10b18ac22677bc606ae8739f59efdb3904abb5` | hints: destructive T→F                                                            |
| `cm360_bulk_update_status`   | `bf1f29fddc2ccf8341ca7166bc1dc3b5f90721f72bfe15ee52dc0d3dcf3f9f78` | `80ef5af7c378f14b18ba001baebc58c100aad73485de9809cd8799365fbfb010` | outputSchema −updated,−failed +successCount,+failureCount                         |
| `cm360_bulk_create_entities` | `8ca191a5f7a8d7740b431617672e3ebf017b082231d090a12cbd75981b7195b0` | `1a4517fbc625530910266417a22b0df87daf6cf0fe45fd4448f4b981c1da78c6` | hints: destructive T→F; outputSchema −created,−failed +successCount,+failureCount |
| `cm360_bulk_update_entities` | `2f33dae89719f005cff5d750523bd9b190a6708c99822f8052b099225dcd3627` | `5ccb5f399ad2fcfc4aa27981aadfa9b0f6a6075190b1e438c9b31e0c28341084` | outputSchema −updated,−failed +successCount,+failureCount                         |

#### dv360-mcp (15)

| Tool                                    | Old hash                                                           | New hash                                                           | What moved                                                                                                            |
| --------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `dv360_get_entity`                      | `e93d8d9d0205701c5d0abe22ed9e1b718ab0d90e9c81fa3dcce1487fe4174976` | `89382ad44b66d9249e3fdf3667721d263bad3734deb01de82f6fb521bac3aa7d` | hints: openWorld F→T                                                                                                  |
| `dv360_create_entity`                   | `942072b5504a3dd8f40cc155b3376c085be8e163c73f70155316bf0adce8a2d8` | `654d87047f58fea60d00a1d846bb3a3848855738622ba64032921bcbc02a3fb7` | hints: destructive T→F, openWorld F→T                                                                                 |
| `dv360_update_entity`                   | `3387044852d4ccacca29a7cfc40ffcf2c4dc0d591eef55a249007383d3fcf7f5` | `ec9a1ade23941586ed29518257a8eec27ecb0da76c2af39cb97d4180a2ed6932` | hints: openWorld F→T                                                                                                  |
| `dv360_delete_entity`                   | `91a5561f5da4423b4a0d8800a8c39b5abe868d2432746afe4660acdfd26b891b` | `766d9e2551f6bd5a11a8ca287ec645f8f9826d5f10cd7e795d65d9a70a506337` | hints: idempotent F→T, openWorld F→T                                                                                  |
| `dv360_adjust_line_item_bids`           | `69a51d058f094e5ab75cd6dd531ad15efaeeaea1a721e8f4896ee36915e94e4f` | `b846ba415affed0b22a3eec2c89c5f490344774466684bf8d5985e47aa4d53af` | hints: idempotent F→T, openWorld F→T; outputSchema −totalSuccessful,−totalFailed +results,+successCount,+failureCount |
| `dv360_bulk_update_status`              | `9bccbc18177830171de40504293a490265dfde7c255505f450b96bd7f9eb1fd9` | `daf8678581bd5e1c8a3f4fcedf48aaa0ba5e141662f814efa5865755fb9343f7` | hints: openWorld F→T                                                                                                  |
| `dv360_bulk_create_entities`            | `1d4a395bddb013774c33d7851127be7f0c2a003aaf08d7b0a1312a72ad935745` | `a781fcda2adb0627d88d3f090a4a312f702415cd2c88769bab4152341405b785` | hints: destructive T→F                                                                                                |
| `dv360_create_custom_bidding_algorithm` | `8ee08b7901edf2e38793ea86d02dd4332df4fb0b5af003d03b7e0339a8273642` | `32c6fa217126b0437e83f6ff3db99e941a3ffeefa51f2410f6bca09d0b80b2a9` | hints: destructive T→F, openWorld F→T                                                                                 |
| `dv360_manage_custom_bidding_script`    | `0d1da70eb7215a7c037bcdd48e10dd5e00ed4a0ab17e34b87bc1a46ea18c8715` | `a3db0d3444d7807b7b44b3205f3b9a9dc49ac6dde16d7ab7d11fe96464ad19d5` | hints: openWorld F→T                                                                                                  |
| `dv360_manage_custom_bidding_rules`     | `9e538f429c523501843b25d6f73f276546b53228015d2263f38ba78abf469f18` | `c47bdf78f4ea5defc96529c34624f7cccbeb81e8762f795aba66e635d9a114b5` | hints: openWorld F→T                                                                                                  |
| `dv360_create_assigned_targeting`       | `56e46b0b9333c8729ab4cd9eec415e84d757164c009f2651929bf577e6ffbe12` | `3a262e05ec549f062454e185d1ca1166562e9b767249829b28c59d5e6eab4864` | hints: destructive T→F, openWorld F→T                                                                                 |
| `dv360_delete_assigned_targeting`       | `faeadcfd6e8cb9bc4c5248ee76e63a6baea03f17da9164114eb553809d4f360d` | `f8e4bbef76c8e9bb53f974c14bd6892b72af3cac59381cc3975ca387643ca349` | hints: openWorld F→T                                                                                                  |
| `dv360_upload_image`                    | `a3cca171e1f9665e5a33a370ccb784c97521f2ea158d1c360b785ec85b5c311d` | `98a0542334293b71619e1212ea4306d27bf675755930bf5f980d24e0833eec69` | hints: destructive T→F                                                                                                |
| `dv360_upload_video`                    | `7dc485d1c20f1cdababca5d78be53d9e8b75f825588fe3a0b2c109d27cb2af3d` | `2693fbee42fe2a10c1172da0a09a5723fc738b7cbfe69c5fe6336cae2097b5e9` | hints: destructive T→F                                                                                                |
| `dv360_duplicate_entity`                | `aaa98355d2c1beffb3c2dfbc3d21747439911167e6004a6013ea734543a34b6e` | `44c40ee4b2e28e71aec593713bb8fde217b27cb129c9e8d64666f732e553f41d` | hints: destructive T→F, openWorld F→T                                                                                 |

#### gads-mcp (11)

| Tool                        | Old hash                                                           | New hash                                                           | What moved                                                                                  |
| --------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `gads_get_entity`           | `486cd7b6758866b4b48af10f7f518e5eefc48ad234f7cb09e5ef01d010a7a5d0` | `7f0fe12960c0bf6b11f11848728d6bc2649d984423906de77644aff8d9225c64` | hints: openWorld F→T                                                                        |
| `gads_create_entity`        | `ccbd44bb25e6abb9b0f4b770253904757005f64b481a7db48c442edd72547c19` | `eb7389837603ae42803b29eea4189b8da03c9ab9dcee7911df0eba664cc26cbe` | hints: destructive T→F, openWorld F→T                                                       |
| `gads_update_entity`        | `03e1f2c375b746f2f12195adb8bf7f8061379d4d9f19cb7c6c1106fdc1072b31` | `032755cd29a90900efac214848e51b45ca86153f3d21e85310f051df7fd87060` | hints: idempotent F→T, openWorld F→T                                                        |
| `gads_remove_entity`        | `a583286d25b29e4bfa826091bc664be9e9297c3452a6f6aaedc75ead624bf37a` | `41e200716b7b5e4c11ca032147c6385e210b90ba545466d845786b6ade717189` | hints: idempotent F→T, openWorld F→T                                                        |
| `gads_duplicate_entity`     | `d6b1390d8eb0a153a2e6d3aed5e792dd71a0cde42802c4273aa294ead3f9f0f0` | `d248aa5faba9b5fa9a95f322feb1d05fbe4d89e54d2e09a322edd4c7821a05a0` | hints: openWorld F→T                                                                        |
| `gads_bulk_mutate`          | `af37cb8840bee8fbf4a33ad87e92b6c0dd288e645e5cd77dbdaeb8d874dbae6b` | `c30ffe941cd7980e571eaf3d5673540cf816b0f4ebcd7b00ed5ec7e55b3485b9` | hints: openWorld F→T                                                                        |
| `gads_bulk_create_entities` | `c00a5b6a994adba2676353ea3a8edbfd76711d4cc9a7d2f6d2968c132d0dc673` | `2cb9e34293225a8c2ae51cb351312d4fe6be7ae94c74b3f48176528fc7bce577` | hints: destructive T→F, openWorld F→T                                                       |
| `gads_bulk_update_status`   | `24098b1a39a2ba150747d8e25cc6457efa81b60e874d04e972c78910a52a8e65` | `ebd60d6de154338725ae6546aa875711d5349f4c91b7113c56db137b9984f66b` | hints: openWorld F→T                                                                        |
| `gads_adjust_bids`          | `669668295f31710fa11b02bcebe1c4a288cb43e88172da97d2c3ea4a169e8d20` | `691dedbad84728c04cf96cdbe80fe27170f08a1cbf43ba4d01c2394f991066d8` | hints: openWorld F→T; outputSchema −totalSucceeded,−totalFailed +successCount,+failureCount |
| `gads_upload_image`         | `fc13f3341827090810ec00458e2d135d8c0fea84586c3cbe813cd5b24b044811` | `7692fd4d116bcffc6fd5abc709cf668354898741801c1c47de18d33dba2ae155` | hints: destructive T→F                                                                      |
| `gads_upload_video`         | `1f438e482bb5c8b37c8841a0047f9ef04b2c7117e23dcaac99fbb046fb22f2a7` | `722932b26e43f0a6e365891f97f20dde2457a8c4bd33458f69ceafaaeedc5aae` | hints: destructive T→F                                                                      |

#### linkedin-mcp (11)

| Tool                            | Old hash                                                           | New hash                                                           | What moved                                                            |
| ------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `linkedin_get_entity`           | `2f886d9d968addf98e1f639728a654bf9c5faa93c8d024d9e6403a78b112586a` | `5c09d8896ce96797d4811e8de8a272dae0a83d5d7a3bbc64c9a9d4894328967f` | hints: openWorld F→T                                                  |
| `linkedin_create_entity`        | `dcd823b19190edb9223a4448b22a65c4328c5327450c7d14ce69e048cd7a733c` | `4d504400e6ecf69a7ae188417b9fd3db4b4629ddee2cddcf86d098c42cda28f1` | hints: destructive T→F, openWorld F→T                                 |
| `linkedin_update_entity`        | `8b5a36ec5cb52332a53be0483656e67873b4b02b2023cad298c7c54245d07a85` | `f45dbe237dc23b98dfbf5479d5f26a6ec95fe8502e6600930a7edbe7a6315cd2` | hints: idempotent F→T, openWorld F→T                                  |
| `linkedin_delete_entity`        | `d49f7c677380c81a6698069a5d84858c5c106bf09b44df18f558b574216ca750` | `9061998145ef0d3574d6abb15ed10098d9cb233896d45563f0fc9ad7709cec83` | hints: idempotent F→T, openWorld F→T                                  |
| `linkedin_bulk_update_status`   | `5a79a50ba1616d082e672039da16bfe4edcf9687e6d3e728ba0e4b95aa0a4d53` | `28b1700f7490d277f4fb54b01e11b3eb0295cfb27ae650418873ac0729e29cc0` | hints: openWorld F→T                                                  |
| `linkedin_bulk_create_entities` | `4ee42e4999d10b18e63533bc92e464322855849d4c3355d40a918d51cec46240` | `97d4884c579cc3fbfef1de29bb7912349ed12ff919f0d55d0f82d02047ee1dff` | hints: destructive T→F, openWorld F→T                                 |
| `linkedin_bulk_update_entities` | `65e3702aee2ad0ca7275ab50b76ee0683b1ec7bb603853e24e1683cba89d308b` | `04e2ad9c68440b75215a7224ad2a1e7454dcc0aa91fbfb0f1fbe963326cc8954` | hints: openWorld F→T                                                  |
| `linkedin_adjust_bids`          | `902f21848f593154b29a1042637b98ec0b27689cd78ef2920dec4ee8bfd6eae5` | `4db8f7c4da7d9dabfb2380ef8de64ff812040e9afdf2e43a0c7cbe2e52243df2` | outputSchema −totalSucceeded,−totalFailed +successCount,+failureCount |
| `linkedin_duplicate_entity`     | `a944b0586c709308c3c638807d4d4cc526e6c4b4d81650f935d3aa3583ec6d60` | `27e0edde974865688ad6e3edb1f779d04ffddeb5b4eecc11edc108ea39612b64` | hints: destructive T→F, openWorld F→T                                 |
| `linkedin_upload_image`         | `e371b4bad70443ffbc09ded03f6687768353045a6870a9b87293713ff824efc5` | `16f500070162c991405f3550d8b1fac28a41c6a5cecbc598ae091192a522099b` | hints: destructive T→F                                                |
| `linkedin_upload_video`         | `693e21ad02226b42d204d6da6f214dc8bae3b3efc694bda44688fa8b34a7ba50` | `791ee76f41ad80d2d0f527e7036da59df97ef4b4da7ec9ea4dd5d4d265c492e8` | hints: destructive T→F                                                |

#### meta-mcp (10)

| Tool                        | Old hash                                                           | New hash                                                           | What moved                                                            |
| --------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `meta_get_entity`           | `ae456d17134a582378ca0ceeba7b71271a60360373532c6cf13abfdb6c0d5cc3` | `915c4878ad2c60ed3262111c88aa3f5a813dc74b8899fb69a3f87df2f151cd38` | hints: openWorld F→T                                                  |
| `meta_create_entity`        | `4ac2becfe8d2b6e18ae3d3b7758f6b0b275e81cebfa843476f1f61d4a0d7b9b5` | `27e5b621f7bb78d1b0fc4ec258d3cb71356667d7d4c8565ddd5ce204ad0b17f4` | hints: destructive T→F, openWorld F→T                                 |
| `meta_update_entity`        | `20b2bf254e9cf474c583255b27a2d67590d4b0d0522a7b13edc005bf937530c5` | `bc90a61a9b346acf70aaa2815d163cb121ac57422debef0df1bfcba662f3affc` | hints: openWorld F→T                                                  |
| `meta_delete_entity`        | `bbfdc4191ead3d19a426efc4c0aea51943277bbdbb49459479de85b42c68c122` | `3846e4e5555d0da77c9469d0276f2163e2828c629af143b40b9ee157c8c672e5` | hints: idempotent F→T, openWorld F→T                                  |
| `meta_submit_report`        | `0925729a254cf9a7c8411b60c519ad5c34ccb7fe03f1c41f89aeb721753be794` | `3505acf049c0d0139187e5caaa7fb0588a1ed91c1deffc2add27919c849667d5` | hints: openWorld F→T                                                  |
| `meta_bulk_update_status`   | `64d68269add0be67ca53de123758d6cdfd52443ff1503dd43bae1e092b6b3874` | `4367b6f1873f13abdc57138c7521769d175fa61a1bea9402fa2a36bf289287de` | hints: openWorld F→T                                                  |
| `meta_bulk_create_entities` | `2a9c514b10756ed46fd2a759c8252e8dc44a827902353d027d1fc45441e22322` | `9337688b14936e32d9c90ae194fbde46e91277cecea69bf349d7b9c4f0b13204` | hints: destructive T→F, openWorld F→T                                 |
| `meta_bulk_update_entities` | `4948340049b9d8d634ea074e17f7590b009e64592df9c6ab7bed260168afc2bc` | `2cfede9e53e5efb67dc9449f34e2eb88337a0415489da4b10ce18b4556910239` | hints: idempotent F→T, openWorld F→T                                  |
| `meta_duplicate_entity`     | `8571796c67642f2877e567806529717dccae036ee2b29fb8d863ffbf9406c91d` | `3eb3518a5058256bb71379403b1d40d63b8d8a680054cdb95ef2ee978aaa7270` | hints: destructive T→F, openWorld F→T                                 |
| `meta_adjust_bids`          | `7fc7c9b31dec4b8b35f147a176a880544c420dab6b2075f32e745a0c7d63d652` | `6b787fab1294b85180c368f0c7f70c95e4e1e7ae07c0917ed55f7205d7721e31` | outputSchema −totalSucceeded,−totalFailed +successCount,+failureCount |

#### msads-mcp (13)

| Tool                         | Old hash                                                           | New hash                                                           | What moved                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `msads_get_entity`           | `626e0e039d09c6d8e07882ad683e0a3604c881ea7a23241506b291e70ce0100c` | `1b7aee3e1995fd5c38a241df8fec0a694332c4dfa4dfc270f55dd27073cc1b06` | hints: openWorld F→T                                                                                                                                 |
| `msads_create_entity`        | `0b8b9cbf6efaf8ce21ea9cb2c7a55ec17baf103b1a119fd337da38aa9c3fe63c` | `e5d86ee074662df353497ef5c9c13409f32d148dc1a283772f51eb382bf4cd6d` | hints: openWorld F→T                                                                                                                                 |
| `msads_update_entity`        | `4b95c98389efb2ffb6fdcbc88e6cc8b15fce345effc736d478b063a98d5e46e5` | `9ae2724bf6f80f357240a09bb71668cda2e6f74adafcc318b1a5dc67dc83deeb` | hints: destructive F→T, openWorld F→T                                                                                                                |
| `msads_delete_entity`        | `8ef3e203481091805b13dbd8aaee73b6d927ef184282ff218dc0fdaeaa2d7000` | `bc2ad68739be945c744e79ea0b0c29bddf60758d8d7c5edc8deb8d9bf4a86b7d` | hints: idempotent F→T, openWorld F→T; outputSchema −result,−deletedCount,−failedCount +results,+response,+totalRequested,+successCount,+failureCount |
| `msads_duplicate_entity`     | `cdee51649feb3cded5cffdb3d87fe9ec58bba68b25e99543e57fe090e0a56e0e` | `4a9cdbeff4416d561a44139bb2551b3e1a07a062259841cb056efe59026cd003` | hints: openWorld F→T                                                                                                                                 |
| `msads_submit_report`        | `ef734d26aabe86363844df5656b565878b630da35d4c215043150f4bbab973a6` | `4cc49bed53798496b16b471bf178272476e9f2bc9f0789595977bb64f648673d` | hints: openWorld F→T                                                                                                                                 |
| `msads_bulk_create_entities` | `fb2bc547fed2c0049dc80f9542a29903e2776dd6ce9ef570380b18a0dd09a15b` | `94b2eaca29ca2bd7ba228f2ff2ef5696cd01ff760504bbb4f90407c3257ef1c9` | hints: openWorld F→T; outputSchema +successCount,+failureCount                                                                                       |
| `msads_bulk_update_entities` | `610837a3e1b57dbcc54e9629a48a6aabcfb0a21cf2ab3dc1a8035025c1ff99c2` | `c3fcc440b9c789b798361505c12fa0a2c050ff141fd9ff9f79ec31df1c092cdb` | hints: destructive F→T, openWorld F→T; outputSchema +successCount,+failureCount                                                                      |
| `msads_bulk_update_status`   | `6d03159f0c59237c2c37d8a78ad0dfbd4c68532555ee82b0703ac56ac886073f` | `8b34c9ebe87c8113497fff2aa0c318e9f7b38b9a0598b40c9e3ce43881f4d43e` | hints: openWorld F→T                                                                                                                                 |
| `msads_adjust_bids`          | `9994b7f426a124474eeb450424256878d0a5c6eb2bbcb1b7a8092a97749b9768` | `5763937517a05a9d591f87c5bf48515508544193dcc87c53a53259358c4b55e2` | hints: destructive F→T, openWorld F→T; outputSchema −result,−adjustmentCount +results,+response,+totalRequested,+successCount,+failureCount          |
| `msads_manage_ad_extensions` | `51f7b0112d223290a6d8bb1c4270e3136126a97b5ee57e9870a9426f82323230` | `3b236086623fe5ec5a8a24cb3a70d3da47d90c61a82b8e554594bbb4d5637492` | hints: openWorld F→T                                                                                                                                 |
| `msads_manage_criterions`    | `195b9a1e18fa8474e5fcd62b0acb003a8757ed2a56e023ae49c84be5ae9a4ba6` | `af457b0b8e2d6ad78587c16310a173a0017f2e26372b4f993c192e49e8f5585d` | hints: openWorld F→T                                                                                                                                 |
| `msads_import_from_google`   | `e5efe1181d5e73e8b0d80a5a3b9a6acd45aabbdcb38c18bee342defa57d8cba9` | `1a63037bc295e5cf61383718f7dd8748e9bd6f8b11bfb4484a1f375538b0be6e` | hints: openWorld F→T                                                                                                                                 |

#### pinterest-mcp (10)

| Tool                             | Old hash                                                           | New hash                                                           | What moved                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `pinterest_get_entity`           | `5688c012e812d233b5cff8b2ade11d0fe8ac7ae48fc4084bf8f4f387b0c691fb` | `326ec96834a41ad80d92e0972331979f0a42f3bdf35de48190a340a884dcdb50` | hints: openWorld F→T                                                                                        |
| `pinterest_create_entity`        | `a60f0594fba882a2d9a0248464a120f5c5ef632456fa8b316014a3be6b5be73a` | `d88615c8c23f13a7ec500adf4e53e5bee1198b13efa8d870b32c57f9db3e960f` | hints: destructive T→F, openWorld F→T                                                                       |
| `pinterest_update_entity`        | `04d4fd9675166ecae53fd7e156033e4a72891fec53b9dea18eac44097540fb1d` | `5e2db3f3f1cffde8fb234663b8000d35ec600a04fca266c8f0b746f2a75339d2` | hints: destructive F→T, openWorld F→T                                                                       |
| `pinterest_delete_entity`        | `207ef14b2d676842683bf8b3a6d3759ae5ca9ba8f6cae2007ca44e0f3ba4ce75` | `2e310592ec6769f67afdecfb7ec50292f0941ab391bb2d2dd979615d56fff77a` | hints: idempotent F→T, openWorld F→T; outputSchema −succeededCount,−failedCount +successCount,+failureCount |
| `pinterest_submit_report`        | `c23256be9acf7b73fcf36fd9168f1f1d0e59b8780211ec5bbeca5d9fe9fb05bb` | `07bfd25018a77798cbfe5002a824e8534053024e37aaf17e3987108139b33550` | hints: openWorld F→T                                                                                        |
| `pinterest_bulk_update_status`   | `f5535eef64cd930b1392abd0cf7e438ed6e1ab1858b00756b09d53925d73bc77` | `98a076771dba68a0be1fe09f01604a3417aa717d4c1f37576d31d9e404b1c2cf` | hints: openWorld F→T                                                                                        |
| `pinterest_bulk_create_entities` | `d372fa5bd462438fb0663d2a6336f2f0b9b69d12f50a3fccd83c634acefadb64` | `c224db615b664f7530720c0d6cde8e911095a7e6a3155b73bd8e97aad8c5bf54` | hints: destructive T→F, openWorld F→T                                                                       |
| `pinterest_bulk_update_entities` | `f09d1def601943d3012aa26ef5a5390740445e299f631d087fe7a92803c1c0e5` | `abbe495b1a0655bb174eea49847091f94fe08200b6035af64023fc4dbe271a0b` | hints: destructive F→T, openWorld F→T                                                                       |
| `pinterest_adjust_bids`          | `5639817cb84538843f66f3778cf63b8ae6399bf154760782a420fc5904c120bf` | `b62ffa25dd46de6cb4dde1c7aa748528623d1b128acd2fde93123735269e3c92` | outputSchema −totalSucceeded,−totalFailed +successCount,+failureCount                                       |
| `pinterest_duplicate_entity`     | `608c6b7d3151fa5ca29d55f4e75052aecf311c1dd2aa450bab4fbd8afb71605d` | `79891a2fbb1418eb429ab2b6a8b3378d2c2afd2c1f117ecef7eadc896f23267e` | hints: openWorld F→T                                                                                        |

#### sa360-mcp (1)

| Tool                       | Old hash                                                           | New hash                                                           | What moved             |
| -------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ---------------------- |
| `sa360_update_conversions` | `9a7d6914673ea00815a0d3381be1de0c1253bba3ed72e867acb473534bdc8a61` | `9ce24d7d25b8635a34df764e43ca0f8b25d7d9222b58a810f648d01015e74b91` | hints: destructive F→T |

#### snapchat-mcp (10)

| Tool                            | Old hash                                                           | New hash                                                           | What moved                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `snapchat_get_entity`           | `f0bf1334852142dd11445a8b3c34ef2034046dd285fbfcccd5feb45a697f5c89` | `14a2f2d283c22462702e8c99e65a882c356272a052c685f81d1357bdad274457` | hints: openWorld F→T                                                                                        |
| `snapchat_create_entity`        | `bc021bfd958ed1977e9cf67bd3525cb5d9104990fb171c0e461d36f8e2e7cb92` | `182fdefebbabafd642aa21052359ebb4fda05f850947836a0159f9c875c0ddd4` | hints: destructive T→F, openWorld F→T                                                                       |
| `snapchat_update_entity`        | `3b4e5bb565f01cfc8fce8d191b951c81fcd5eff63c6d792eed3153eead9854f6` | `7aa6bf4ec20725bde0bbbacd976e8e46f62b4b970c06d2ccb61a6f5c2f9e5d61` | hints: destructive F→T, openWorld F→T                                                                       |
| `snapchat_delete_entity`        | `3fd8bc9bdfea3e2d4093d1173e2c743ab682084ee4e10c90417a6c89f553166c` | `0659ab3b53abbcdfda82b71d637277a1103a457bb768c94ae746fef42ca0c8af` | hints: idempotent F→T, openWorld F→T; outputSchema −succeededCount,−failedCount +successCount,+failureCount |
| `snapchat_duplicate_entity`     | `ea3f4b0167b87db1f8f0ee7e7c22e302596cb3a4ede8ca5b01f6976951973575` | `eda124c7bf3fb49203ee44ff444829d06285039d9e66a269d4d24036b981e5a9` | hints: openWorld F→T                                                                                        |
| `snapchat_submit_report`        | `c693ef838f49cfdbbecc86b790840c22696d6c358eb55bc072b557e5d9a1b69b` | `c8e67f649ee47b5241d8a53c51865d5632aa96bf188332e3b1bd445c6089f253` | hints: openWorld F→T                                                                                        |
| `snapchat_bulk_update_status`   | `3d3a0c5056ddde2a8574784616ca7766eaf01cf64ebe1f2eed7a23a3f5432d9f` | `81071a4e9239637590eb68c958f371c5327b8f9c07030e96e646353d66dfc1cb` | hints: openWorld F→T                                                                                        |
| `snapchat_bulk_create_entities` | `e5ee83b841df320fc9590b2217b43b2a7fe52ed320ff5c4de279239659a7ba7e` | `358d2e814bd00956f9aeef299ccc5b218539b7ee12677973d11dc57ef5244c16` | hints: destructive T→F, openWorld F→T                                                                       |
| `snapchat_bulk_update_entities` | `dac0b1e1d3a41b9a96f9c467ca38b277948932e001cf3dbcbe3d13aab3700ae6` | `d73eac9da58fd9f073a0b8c4f7b0b16bb832d6887810ef33edc017acef02e489` | hints: destructive F→T, openWorld F→T                                                                       |
| `snapchat_adjust_bids`          | `a7d9d87073122866a2aa243cc6a8dbd68b3f8610d9fd694331f2c11f5bdd8c3f` | `20e225fffc64df0dde3a3cc53b037cbe3633381afa6b50ccec41776ebc0547e3` | outputSchema −totalSucceeded,−totalFailed +successCount,+failureCount                                       |

#### tiktok-mcp (14)

| Tool                              | Old hash                                                           | New hash                                                           | What moved                                                                              |
| --------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `tiktok_get_entity`               | `6c45a6320c03b47eade2905a81f06a2c4960bb0a6537f4f7c0d9328516fd1cc2` | `e5e98e19c3efd196fcf944345bdf3dc7ac7ea09f06ee2a253dc33226ea5fe12a` | hints: openWorld F→T                                                                    |
| `tiktok_create_entity`            | `6a6f612db5237353e3d7671dee5aaa657281cbc62c42d6e3ed3ffa8d0c8a5bff` | `0ad55ed02c2eeba25ab1bec11ad883dac713a014f0716c5cc3b4e6290c0a41e3` | hints: destructive T→F, openWorld F→T                                                   |
| `tiktok_update_entity`            | `59c03a7759da6da5d433ff37c687d8176d07692882bab04225988ecdbc6f5690` | `98e27716e3efe4b3831938f953e73b7a5dda0e50bac50d8a56364fca72b807cd` | hints: destructive F→T, openWorld F→T                                                   |
| `tiktok_delete_entity`            | `6acd28229ece63c51e767900c139ff5c67591a4718a900d8fcaca671f17e8ecf` | `d0424d30f75ee4fdc4b2d70144c02c1537d17151ddec684314b67dee90696dcb` | hints: idempotent F→T, openWorld F→T; outputSchema +successCount,+failureCount,+results |
| `tiktok_get_smart_plus_entity`    | `b6c18454e00a99333d35c256f7eefea027c047e67cc257d1cf3f9c24b1055a0a` | `64f6e437b89660fd837af957838ff03ed2fa78c0c786f89dd8ff3edba8fc9d85` | hints: openWorld F→T                                                                    |
| `tiktok_create_smart_plus_entity` | `f8afaa57f7b2fade10631e2b1b1f93aff0a7336549627991b645527d0ed271d5` | `310b814b29a6a2d6965513670284d4046c86bb9d8627ba3be8541f5c96fc270b` | hints: destructive T→F, openWorld F→T                                                   |
| `tiktok_update_smart_plus_entity` | `c8e595c80e70c0eb42e1a3d0a6430e29fd3a1836b59d0a8b7b4d93a63e89de85` | `d4620f14e6d9384f3c6e016c32822a8c89867db26ea4436d63f3ccdab63094d8` | hints: destructive F→T, openWorld F→T                                                   |
| `tiktok_update_smart_plus_status` | `a0ed2c8dfb24ba6952bbdec1f6c7c08a16ff1853445a5f7888dd82a33e430e31` | `048cfb4ed6e049dfad99bb25458dbbb33a1dfc7add380b39868a7941a79b1851` | hints: openWorld F→T                                                                    |
| `tiktok_submit_report`            | `618ca43a8dccdcc690f66f7c12c3991c1c090a333952ad3daa9867b4c1cfb82a` | `79ec4cbe78c4a6d7d6e16c81c54bad6e19499c9721eb5d6714fbb93add00dee0` | hints: openWorld F→T                                                                    |
| `tiktok_bulk_update_status`       | `579f3c8678c10f8c0af0068cb414383fce4e99f3ced4b734063beb3a19906ae0` | `db0a0a2b2eff0e3c71eaa47f1413ec636e3e989f52b43883b74615a648d77cac` | hints: openWorld F→T                                                                    |
| `tiktok_bulk_create_entities`     | `eacaf7345e051a424c63a62f2cb39ab8490372328531de3dd49ab5590bdabbc7` | `8b934016d4858ec780e1a160251e8d0ee4c5985a7946bcbbe6edfeb6cd0b61c3` | hints: destructive T→F, openWorld F→T                                                   |
| `tiktok_bulk_update_entities`     | `6dcac7092d4faa4d23f866e8c3163234a03e9f1481c1eb218c575324710f4cc9` | `87653abd0c66a985950ca79f0bc013fc5c73900f62de71574481b0a9dfe72d1f` | hints: destructive F→T, openWorld F→T                                                   |
| `tiktok_adjust_bids`              | `ca99a91cae0578017ebbd954319b5d78cce184df014ad97bc8f70423bb4edc41` | `7b06c131740e5dfa45b15dc8679662d593c6870670ca025dba73ea5755f8b970` | outputSchema −totalSucceeded,−totalFailed +successCount,+failureCount                   |
| `tiktok_duplicate_entity`         | `572ff6c7176adf6ef040aa3608e1bd12c784afa16ab888c07a590ed3ac893c4f` | `2bfe3440876e72411c631cba1df25cd47d8fbe0472c782d0b4974152672fd632` | hints: openWorld F→T                                                                    |

#### ttd-mcp (22)

| Tool                          | Old hash                                                           | New hash                                                           | What moved                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `ttd_get_entity`              | `f5a303ff09dae2aea07bdabad3535cce2fc498bd806b554aaf7a99d733128f4e` | `f3acfc4d1782b74a0058e70dfae7800e6b9119af9c7e1e47f099cf9f8390ca22` | hints: openWorld F→T                                                                                               |
| `ttd_create_entity`           | `4fb4c7cf1ac9a63cd05838df96aba9bf7ff80b7debd83878331a90bf7b0fc650` | `dbbb01de1e06a47ca5837ec3f5d6b453eaaed4b1f01e6a9525761612c4419513` | hints: destructive T→F, openWorld F→T                                                                              |
| `ttd_update_entity`           | `fbb6efa6b61833bee8210cd4759b4442aacada8c370e1b0a5a1ce28abea48903` | `355180919552f3de77721b69940d8e3a714f2eb33e3e141f4989ee50eac51689` | hints: idempotent F→T, openWorld F→T                                                                               |
| `ttd_delete_entity`           | `aeddc09987b5453bb134702116a3bf130a9acd5572ae948ad2f3ce91c01f8ffc` | `aabf1bd7658c69768f43a52922c78beeb5cb53372c830e5697b9e1a481590c42` | hints: idempotent F→T, openWorld F→T                                                                               |
| `ttd_duplicate_entity`        | `4632ff56dbfc3932675354bfc72a5b80388c04549558ef8704432f8730072064` | `7ad8862839d1653e2fc680f1e927410fa98d172f2fd54d22f038c68157fc76c7` | hints: openWorld F→T                                                                                               |
| `ttd_submit_report`           | `8ab7610f08f33e58a63aa0917faf2286b9d5271cf16502623c446d417dc08cdc` | `3d2f274bb423a189c07e0dbae9e4620f44a1f9dc69908212d6bbf84701bbac72` | hints: openWorld F→T                                                                                               |
| `ttd_bulk_create_entities`    | `d9fc8d01b2b6679db73f46fdf9dbdc94ad02f2a1cedf23622eb325072d1bede9` | `a5c4b50786cbeb9afbd12d9fd9488cb67310f769f1d6bd4c1f720ed7823f1dab` | hints: destructive T→F, openWorld F→T                                                                              |
| `ttd_bulk_update_entities`    | `5152d7a865a70a606686b96e0d8733983de8b3869b9d6a9b81efd395e418749b` | `9f89b2515f69fbc389b3740cff6f102799bd403acb10d2861af81131e9712400` | hints: idempotent F→T, openWorld F→T                                                                               |
| `ttd_bulk_update_status`      | `036b5cac6d7c83cdee14554d0a054ffc052def2c2f33a723fb51a46a1a1967d9` | `c1341641c22c6cd588a2fe631e1d05e896d91e3351d7f63cb90df383afa747b8` | hints: openWorld F→T                                                                                               |
| `ttd_archive_entities`        | `bae32b71921f3b3b8ee285c11ca06c5e0368372b10dbf687b86ed7023dcc343f` | `0d98b3da276a4e830803d24fdd7cb89f62856e1875cbb933e2a5d9a1f272d15a` | hints: openWorld F→T                                                                                               |
| `ttd_adjust_bids`             | `f7f1bbe5e79989b73a72f463df0233f099db614411f61e6b590bffd453e1a350` | `98a8a28c64d8fbbaf57c94867e73dd90367eca4598d71204d7b8a4528ead7679` | hints: idempotent F→T, openWorld F→T; outputSchema −totalSucceeded,−totalFailed +successCount,+failureCount        |
| `ttd_manage_bid_list`         | `19fcc0b9d4572aef0fa0ae924208967d9eb5b13bdddc82f1ed3c5589dbff8e68` | `a80e31b5ed3a6f7904bb244d72972b0244be76c867ea9ad36d220b8a868fc091` | hints: openWorld F→T                                                                                               |
| `ttd_bulk_manage_bid_lists`   | `2ac78ceb5c13c1c17d2a0c58594f696ed888b2ae5eba6f5ea3daa190c0abc852` | `633c0af5f979ce82ecf010f7b5be4b0bd576a885490acd18e75ccb264a9b24d3` | hints: destructive F→T, idempotent F→T, openWorld F→T; outputSchema −succeeded,−failed +successCount,+failureCount |
| `ttd_manage_seed`             | `1333d67b81bee25b6058f157740018da45cd0a5a77c3a3954b839834a2065b7f` | `b0fc72b629e9cf60ee36181c51d31b611a108d9261c8e714e3dcead9a74b3953` | hints: destructive F→T                                                                                             |
| `ttd_graphql_query`           | `c6358c5f902c9d1956190b38885335436fcf6b1fd1e4cc9da9b934185d3de24c` | `71af9c6271ceadc941cb69548f073b77a9fc3f86bfa5f0eba7d7745a1d3ac3c7` | hints: destructive F→T                                                                                             |
| `ttd_upload_video`            | `2e95a5351f55b1649b546d3b59e763c1731f99bd529a6b95c9e01ccf3a1851ab` | `e9f6220f2c1c0608aca65bc4c0f8a67a21d0515deb5831cc3b0ebe69aaeda726` | hints: destructive T→F                                                                                             |
| `ttd_graphql_cancel_bulk_job` | `ccd0ae4ec408ee99c2ca3ae1b57faadefaa9c969b587cf5584406e9c7392c155` | `1bc232a5566163faab60a775ec7d0d3a1258480f0b66cab62a68205e27719d2f` | hints: openWorld F→T                                                                                               |
| `ttd_create_report_schedule`  | `bd6a7728d19333e2e75b000967c28b5ba5ebe13d4f05f3478b7181d97549f7b6` | `0343b85526b24a67aa4bd166cbfcc5699ebb8c6df2f1c35a01063bcd2e201711` | hints: openWorld F→T                                                                                               |
| `ttd_update_report_schedule`  | `e9827a06911030ce4c67500def7908e2ee90abc1d3785738d19f477841d9fd31` | `8eaeb9f1e681238089c5cc47b57b53a733dc65c4e81b124e2807b272c2bd2a1c` | hints: destructive F→T                                                                                             |
| `ttd_delete_report_schedule`  | `eb8d7cc5f20552d8aa11dd591b9d93bd3bb8f5b255d2767017bea8580e986d6a` | `cb8d500edf71f677919041f581eafb601094572c03cfaaa22cdda1217558300a` | hints: openWorld F→T                                                                                               |
| `ttd_cancel_report_execution` | `86d6c9fd95fb0850832806424adc7a51a5d3d5717fef8dee99e57e3663e82f09` | `ecb9a04e3020dd5eed83a5c79b5e7a463e8b24e35a5b75ea790aee4f50a8c9b0` | hints: idempotent F→T                                                                                              |
| `ttd_update_report_template`  | `81405c58921c094c7bbc124144311bbe2b255a0e69f5a273011262b36597a812` | `763f75ff56dfd7ea42100a869d8842bf0ce21da014de711f8a4b60306a8deb8e` | hints: idempotent F→T                                                                                              |

## Ungoverned tools

#### amazon-dsp-mcp (10)

| Tool                               | Old hash                                                           | New hash                                                           | What moved                           |
| ---------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------ |
| `amazon_dsp_list_entities`         | `184254092ccfb3b1156823ddfb0c43f648fc9bbc76e7a33707cca9303cff1e15` | `8fb1ccc3b2c2f720fbd52369eacb9e3c533fef2d3b7f337b8144b83275bfcea2` | hints: openWorld F→T                 |
| `amazon_dsp_list_advertisers`      | `4c52083f6c870542f09f606f75ed6dea85db08e413685cd6a5097bcf482b5dbd` | `97e35845077bfef5695016f422c83202edafccc2d610c81be0151cda20fdc877` | hints: openWorld F→T                 |
| `amazon_dsp_get_report`            | `38ef90af03d70770c9f2712c538342554fdc82aa108383cc3ced37ff770ec888` | `4e18fac58549044df313e2f3905ebe29eaa44bcb493d2d8b92e2c0d67db07d6f` | hints: idempotent F→T, openWorld F→T |
| `amazon_dsp_get_report_breakdowns` | `acae2412c7afb7d1333e59103c5120628232e7c230d2f01752b7af634d0c287c` | `17cc2f56697567e65c40d32f3f704c4716fd2166f135b369944d51f13bd99e70` | hints: idempotent F→T, openWorld F→T |
| `amazon_dsp_check_report_status`   | `1ce9ce019b9f1661073e778d2c76fe4dbce3d8efd90040c361c790fa44d52766` | `e29e23d60d5dd11a490fd91b081ea167f6b00cb65af055fe9e1e3eeadbf1d4a8` | hints: openWorld F→T                 |
| `amazon_dsp_get_ad_preview`        | `ecfb57cf230854d3c32351df84c99e460c3f2d1de1f2ee6f05bb05259332b57f` | `36746ce414268f336bfb368f146b5e069175bf671ff4f5910beec6d82156832a` | hints: openWorld F→T                 |
| `amazon_dsp_list_commitments`      | `7a88b5ca905333e12038bb65e6c8a4fe19b0b83dd66071586de7a12173933c7e` | `9178c29e59299b3a228e31ecdfce88f24ec16a34c384678a7e02581de78ea3e1` | hints: openWorld F→T                 |
| `amazon_dsp_get_commitments`       | `e01fd0c855c809166e7e1bb5b174b87fdf407b793af90f15c2f373a695813244` | `3061f63cebecaf9c316dc7807a6d673336719c4b905ddcf0258023b07a4c1c94` | hints: openWorld F→T                 |
| `amazon_dsp_get_campaign_forecast` | `5aeb8c1d7f3fa9661e3edf8f35e6c759bff025b0f44327fec035700fdc889085` | `271c78ec53c7355e5550ed847d9a5772e15c25588364b853cb20aae0f7357270` | hints: openWorld F→T                 |
| `amazon_dsp_get_commitment_spend`  | `00f240a2454a5719d9d9fd7b03fdeff081624ce93607291a86602b6bf232ab11` | `89951c4ff24fe590ca623c5a201ac1aad7a20ed27ed6ee32b69f361b0d1ed22e` | hints: openWorld F→T                 |

#### cm360-mcp (2)

| Tool                          | Old hash                                                           | New hash                                                           | What moved            |
| ----------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | --------------------- |
| `cm360_get_report`            | `3aba6a1bcfce5e6b139cf3c2dba073a33006ce4febbb2f937040820c91ad08ba` | `0206944135dc69a1a986c172c9e0ec5fe29ad005ffead91419085c7012362b85` | hints: idempotent F→T |
| `cm360_get_report_breakdowns` | `7e512a74eab6168a7a63e05aea9ad4dde671954fe1b147c0fe3bb7d9111c8cec` | `6e209d11a9f0048093f7cc7f9f021ef0b191ca53a14c6f12a41cce62f0e26e8b` | hints: idempotent F→T |

#### dbm-mcp (4)

| Tool                          | Old hash                                                           | New hash                                                           | What moved           |
| ----------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | -------------------- |
| `dbm_get_campaign_delivery`   | `a35c2850e62d1f95996ec0653d39d958d70d77d672e0e1ed1ad2aa56b1dbca79` | `9e248c6d8ad1b36208f7a69edecee070c9a98138bb14748bd9d6382adfc441be` | hints: openWorld F→T |
| `dbm_get_performance_metrics` | `cd1ee6775a3f03c355c527705754e3d6ef1a7668aabaf06e5b2544e950a68402` | `2744c6bd146954720403a17bd9e0d3346c2aff01bdcfe4e4f5bdbeb1540185b9` | hints: openWorld F→T |
| `dbm_get_historical_metrics`  | `f9400aa1a47eac5c5b66562a8692a295c198813b3325ccf401712c79b7b3b12b` | `70664bbed4864577dbe63baeee99b3f268aa809ebca3541f783f3005a953f87b` | hints: openWorld F→T |
| `dbm_run_custom_query`        | `3d6dd1768274778d54227ec87189918853edba5c157a5e1681faae1b03f6d6a9` | `223521baaa09013d0a6a12e36e371c06f5f30e6d5dd2f856e57dbed97862b3ff` | hints: openWorld F→T |

#### dv360-mcp (7)

| Tool                                   | Old hash                                                           | New hash                                                           | What moved                                  |
| -------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------- |
| `dv360_list_entities`                  | `f3285ba88aa588e82a341128d838273d24a930e43a20f8952126cc32361c9d86` | `34e85c2d066308f3d39de6dbf4559c6a0680544865c8c4daefdbd9361c08607e` | hints: openWorld F→T                        |
| `dv360_list_custom_bidding_algorithms` | `d4bff3628d84fd161ba737c3abe060d351250d81c08fd94a635f5c34a7ab1fe2` | `77827df2d3ae4459a9adace354a4b431a9438e3d5844ec7c572c8911acd64376` | hints: openWorld F→T                        |
| `dv360_list_assigned_targeting`        | `71d410af3b312159f922fbfcc16b1d215a26080ecf205789861648e7ad23843e` | `75a8f29bf0684336e7258dd1e9bdad9b652dc09b2cc246194fe8c40a16eaaba3` | hints: openWorld F→T                        |
| `dv360_get_assigned_targeting`         | `824eac55343bb4e7fa35710414147ef532ba82c6171e58c640de0336f7d3ffa3` | `115c6e4cf27d088c379e2ff6995ccaa3bdd8bba8fa526894f846c416cebb6116` | hints: openWorld F→T                        |
| `dv360_validate_targeting_config`      | `91ff8838778944a3a8b17cc36cae587314f11234986eb06914de5cc9503ebbd2` | `587663df1fc9f9f528cdd2b862b2fec700039376adeb311f36fb87aa304cb5b5` | hints: openWorld F→T                        |
| `dv360_get_ad_preview`                 | `d162d4d1c6b9020a1bbfefec00ca3b90d4959e74e33559215cc903de6751246e` | `561463635ecd7079ec2dbe34f0455917c33b18bd4f96d70955b31fc4cfc9852f` | hints: openWorld F→T                        |
| `dv360_get_delivery_estimate`          | `5173ea378b8988ce75a5c390baf11713309ea2b9d6bf6ecb3cc86886cb9b1b62` | `2a846bfa78fad640d55b0397b91430be74ab7256434f3dfa57342d3a7a8a7622` | hints: openWorld F→T; outputSchema +parents |

#### gads-mcp (3)

| Tool                  | Old hash                                                           | New hash                                                           | What moved           |
| --------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | -------------------- |
| `gads_list_accounts`  | `9f8a5227e72285e5aff175d62cd78ddde9cfca2e551a0b9327b44329fc88997d` | `07c94232c9e275d77140a7a158075b81460773d4595ff2f3f3183171a96c5976` | hints: openWorld F→T |
| `gads_list_entities`  | `92ed9cd00a8c8d4800d652193eb508b7a8bf982312cb693fa62d19e75318ae81` | `38b39216b310fdac9510c0c74d19208228607391edc694a5350ca76456aeb998` | hints: openWorld F→T |
| `gads_get_ad_preview` | `d0af1ebda2d4a4f342bbcea0e585f4438c52ca8b0c618710db2a5027200b7bbe` | `886e244bebff578fc05da3bec7d68befeba7700cd5f1717554dc37ecd0bb5a91` | hints: openWorld F→T |

#### linkedin-mcp (5)

| Tool                                | Old hash                                                           | New hash                                                           | What moved           |
| ----------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | -------------------- |
| `linkedin_list_entities`            | `8d78452aa94e3bfe0e10c17f599a44f38410c493cb2d2bf59bfc77a28f4c2f27` | `5c4519c5c341803c16b57ff226c6063ba5390416abcbbedcee71664618deb032` | hints: openWorld F→T |
| `linkedin_list_ad_accounts`         | `4b3b476902a87f3731c37396a0c9075527aee7acec7c0b8fa14fed9b2c04cc18` | `33b8bba3ad78c11380c889d8f008b420dc47c47ba415ab57267ebb3453e9f1e6` | hints: openWorld F→T |
| `linkedin_get_analytics`            | `92a4588a8d36a88c4e07f0a97446955ab7dbaac86a09f6060e05f353cff058c9` | `88f35b8f52aaf553e08402f4be784fc20faa29d55dd6c50385d15f494ff712b2` | hints: openWorld F→T |
| `linkedin_get_analytics_breakdowns` | `758c4e7028493d5f9499937928ac6d400e7fff269e67c8d8e1b3ce9b3053b974` | `79a3e8e15bbd51a935c9f6131af1371757263c16900d7d5df2718cdb9bd16d94` | hints: openWorld F→T |
| `linkedin_get_ad_preview`           | `d0185d915ca3f5506110e9aa0104612f540eb44efa54751bbe2ed50039501935` | `7c5f32473bf062d5bb799a8e092ee67cb8667c462e73317b6942aaabed28e873` | hints: openWorld F→T |

#### meta-mcp (10)

| Tool                           | Old hash                                                           | New hash                                                           | What moved           |
| ------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ | -------------------- |
| `meta_list_entities`           | `42b825318217b7c125b968b8ddaa05d7da40d52aee454aa45c765bb3321697a3` | `b0c1f716cc4e48834d58ec068a6ef8c313fc11e43804fc9d47980de452e5e00c` | hints: openWorld F→T |
| `meta_list_ad_accounts`        | `1420014d698e4ac53d61fb5c13b5f87e5d0e3cee4b4c86a867ebf084ca7c89cc` | `57dd73cbfa0aa5f61dac158acc6e617294cdecb463e202dfc12a05d6ced6803e` | hints: openWorld F→T |
| `meta_get_insights`            | `3c6c6cd98d16212ab371b3ab626670eb61ea59a80cf189f95bdbfc520b450294` | `6bb4fe625dc0828b46ada5cfb2b3f889b2ab8d76f88df4586c36194805bda76a` | hints: openWorld F→T |
| `meta_get_insights_breakdowns` | `d8611f0245b187a06b0c10288844508e9c7ef7aba1b6d509afc7ace5de3ecfbc` | `8fd052ca503c9f6e6022eeb8dadea725fe0327ffab8892c3f104eac0febcb7c1` | hints: openWorld F→T |
| `meta_check_report_status`     | `d29ab8192624b10ea592979c16a2249472683691b7a0ef7d3ad73a538d295f31` | `dbb1788c371ec7169f3119b9b0f4595cb82ac4fbc856d84dcb812920b13f2731` | hints: openWorld F→T |
| `meta_download_report`         | `dc407ea8dbe42a3b8f49d3c7d6d3be4c051bf70009684d07c8b2595bec1e210c` | `a0692e2e8c7cbf8579f414911c95d7c72ae236d63f6edc650c60058fd7709e5a` | hints: openWorld F→T |
| `meta_search_targeting`        | `dab29e46318b6142cf8e556e302d90bd3067e970a7135def168907424bdddfa5` | `5187d08b57b5cb877662ae8276375ef81aa7f80efc0b073d4cf9e8dbd81704b9` | hints: openWorld F→T |
| `meta_get_targeting_options`   | `2ab989befaa214fed72a8cde9e4f262a715c270465cc9a8fe3cc599343dbcf85` | `7c047c50bfc1ae812d2d8704256cc5c277516ef591e419b11d3ef2dfaf575475` | hints: openWorld F→T |
| `meta_get_delivery_estimate`   | `cad72252eed797ace7b879f9aff59ec8c005468b9ab18c256f3ae4de1c20d9ab` | `d7fa19a63d74798896071d7eba03ce991e717f8ef43a29400f046bc428621ac5` | hints: openWorld F→T |
| `meta_get_ad_preview`          | `91e448d579bb51d0295f178fc2bc5c098cdb7e2793c73d2185c925b69abe361f` | `fbadd89444a15c1b15af014080ab2a6ea614e8bdf726062c69f8bac043a16b25` | hints: openWorld F→T |

#### msads-mcp (8)

| Tool                          | Old hash                                                           | New hash                                                           | What moved                           |
| ----------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------ |
| `msads_list_entities`         | `95c0303f6b07247e4ccb384db3531097a7e3da83165d910a1187370c0e9ca59e` | `ab99fd3b3551a22964159dbe851b14599f6bb248517d53c2a6a40097b08d8960` | hints: openWorld F→T                 |
| `msads_list_accounts`         | `bb93ad5f62f52f36038d587378595fad33c71cdb5182c57b94efb76a934e90cf` | `b280fedb97f1aa9741a61c30c8f00867ba75df179f729b36d20d7006e85d5b10` | hints: openWorld F→T                 |
| `msads_get_report`            | `10112fbcc30991e4c4e832334fc776252063bc2600750210fef7cd64cf43cffe` | `6f8a07675e5c502267c463e3b916227d194a579f62143d0190f43ec2ccd746f4` | hints: idempotent F→T, openWorld F→T |
| `msads_get_report_breakdowns` | `3a440b545670336a4e276529f69e3a10b16567e6c3a12c50be5e8f4541effc2f` | `fa19eba227fc06e941bcca3a40730aaf415408d91e20e315ddc30a6c5c7b1158` | hints: idempotent F→T, openWorld F→T |
| `msads_check_report_status`   | `5434983d4325688ebb943dc3e9ecd77cf52153a538d747cdcdbbc65441bfdd33` | `a675c2468dd451b8c1ca69cedf23c8b403a057cd779667677b6ad5f0e220395a` | hints: openWorld F→T                 |
| `msads_download_report`       | `10289b2c5dc6a91f3ae662bc417ad3b632c7e30a17b1b96e0f0ec0f3c3be5070` | `e32fdee55fcc4c554e510d3ae94cf282f7d775adcb584da56606ae5f08ef07c3` | hints: openWorld F→T                 |
| `msads_get_ad_details`        | `3a0b1f7778e2d2f3e737433f2de810352fc7a3813d9873c95304c9953f1c3a9d` | `54b0786e8f93a3ce792100bf7309be61c2b55871395dbdb63f46cebb8e6368a1` | hints: openWorld F→T                 |
| `msads_list_report_schedules` | `11b99f0653c6e2794ae2fb025057e02363e0b2a7cc72261421de519fc2c86cc3` | `d6b24681f2fce92d7135de4dffec8c2aeaf3824d5065956e376fa63db1cacf6d` | hints: openWorld F→T                 |

#### pinterest-mcp (9)

| Tool                              | Old hash                                                           | New hash                                                           | What moved                           |
| --------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------ |
| `pinterest_list_entities`         | `a7c1bac84398db883af0b440afc279fa07c6c223bbf3fcf6456a008306be1081` | `885df65a7b3f20bbdbb525b4589223a9d5251baef5d19bddd2e600e78442345b` | hints: openWorld F→T                 |
| `pinterest_list_ad_accounts`      | `cd5b536fa065cfb1decf3884cad53476da76eb1713abe8cadb6064ce2d66accd` | `76d1909524c530a7293116d2b42b77d97cc03691088f6afd56ac962e9e115e9a` | hints: openWorld F→T                 |
| `pinterest_get_report`            | `8d851f7cb65f1cba4bc05d5dfdf0bd1b2dcd1c64821b27c0766786787b6e8d87` | `300eae52a1aff9d71772d402e5d0eecfdd33cf083d344223a649733c072b3581` | hints: idempotent F→T, openWorld F→T |
| `pinterest_get_report_breakdowns` | `0a5b99ada9010e7df72b6cdb1474c1b1643e3fe4e23166bd070856c531dfa5eb` | `3ba4620ed66a6d08b9fe98bd423561551d1d037ce03e5fbfed52ce047c7641c7` | hints: idempotent F→T, openWorld F→T |
| `pinterest_check_report_status`   | `d6e5c7356253e59903f3fc3de6761311503bbaa0400c2bf1e084e83d29005601` | `7471c0353dfdd62a1590a91583d26403b14c879a0ce5dba33f53111454960ea4` | hints: openWorld F→T                 |
| `pinterest_search_targeting`      | `11b3c10ea8b5448f7fa899b6548c7f8406ae3558805b6bac3d6afc297531b8f9` | `e11b9913ab4c8a1d7bda97eb11f4eac1b5506a827304a6e8f3c6073cbbdd328f` | hints: openWorld F→T                 |
| `pinterest_get_targeting_options` | `5ef430d41c3e067e8f8a064e64be49cfaa1c61561fc63fda3beb6588b47b39d3` | `f1b8379e8576a5da5b52a2790b84529d76c16771ced4ac1c893be2a1bc8a2d0f` | hints: openWorld F→T                 |
| `pinterest_get_delivery_estimate` | `e91676a6a3f7b85a5013c88624a52238bdb595027efbb77e2ef8ced893bbe8ea` | `93766581970bbf4ad18329e14351ab11c30d02eadf49703a2e933a5622fd1eef` | hints: openWorld F→T                 |
| `pinterest_get_ad_preview`        | `e0d5c6cca6a9e3a3c67de54edfd5a9fd9edc6cf0fa6306f6c403f5b5b6f9a5fa` | `73e226964ad431be102c52092d789c7fd2f6f891f308c6d2b9b083a5e9bf4c51` | hints: openWorld F→T                 |

#### sa360-mcp (1)

| Tool                       | Old hash                                                           | New hash                                                           | What moved           |
| -------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | -------------------- |
| `sa360_get_change_history` | `55db93792c792a2c1eb3f700a187a1455e1ebbc52dfb159f9893fe1aa0e4a123` | `ac13f94cdaabba70dda50d9a2b85f7de2040b7271c3c4eb869101ac28fc9eb5d` | hints: openWorld T→F |

#### snapchat-mcp (9)

| Tool                             | Old hash                                                           | New hash                                                           | What moved                           |
| -------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------ |
| `snapchat_list_entities`         | `99947f30c91a616f3f9a3cd240045feb0a725b13f2fe03a688a46c856bdee07b` | `ad99777337222384373c941054610804391aa7470e5cf66eab1189bf0d0b6e81` | hints: openWorld F→T                 |
| `snapchat_list_ad_accounts`      | `bb4e1c33a6dd89989069a3ac077314457b2a4f7b4ec728809b97f057ff5c0f3b` | `2b8028b4c859d51dba33f511ec4312c93a66203a019743ec2d6187f2954f34df` | hints: openWorld F→T                 |
| `snapchat_get_report`            | `1b0d8720d391fbe69494b0e2217fb8ad822ec209e2cf63d39a2be14a4b878f05` | `8e331a17c20f9dc0a6eec49e9742f2716dce43def75f877ac18baae754bea4be` | hints: idempotent F→T, openWorld F→T |
| `snapchat_get_report_breakdowns` | `13226eae904bfddfbf1380abbdc672fbabb741e4e9bce39f67b7e23deb352a4e` | `6e67e804f622b819de70e4bcec9782d046a66c6695b52095a32893b55dff7378` | hints: idempotent F→T, openWorld F→T |
| `snapchat_check_report_status`   | `6ccf0dddf79ea3b810e2da31235ddc3868e67899b2c0696138b809a41cb5d315` | `bc2e77ca747ba0a5d4cd280f1194f4a974bd4b62fa4010f77f0ae8e066ad92dd` | hints: openWorld F→T                 |
| `snapchat_search_targeting`      | `47461eb2656d04067e2b596e77de0e7ed2f4af6de24f066a55e5961d6616fe7c` | `1fdc9fa188feaad4941c07d5d057c5a059a4d540d73ad7beccf03839eed84fd8` | hints: openWorld F→T                 |
| `snapchat_get_targeting_options` | `ff512bc24f908aeb9bdeebbf396389d7ae04f0ccd820b6a8d02df05f4852646c` | `aeea08474396be10bc21357bad2446f2461c2482f2d8ab197e8b7f3ea150918a` | hints: openWorld F→T                 |
| `snapchat_get_audience_estimate` | `c686688255c2e933b720307039111cbc6a93d1da6d70c4ac18d8f671b9102e24` | `6f8f0a0c9271d9dc4b77cf433ea2b7435c9ff01bcd162598e9c713717f181899` | hints: openWorld F→T                 |
| `snapchat_get_ad_preview`        | `1a6da66161c17b4ed3a2d6aa84f12160089f56475a552072d7a0e6d3e5db3162` | `c09b85b4e89a2d1fecb8ea253399f39fbbf0644739f2abf464245e6ee81039e5` | hints: openWorld F→T                 |

#### tiktok-mcp (9)

| Tool                           | Old hash                                                           | New hash                                                           | What moved                           |
| ------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------ |
| `tiktok_list_entities`         | `1b253d1958ffd2e5072097a71baaa5905f594db6a7d67f1f9b6cacc3a716156c` | `146f2e9cda181c0e4066e45fa65b9ee4e9c8884a417262f547ad015ad8ff72f7` | hints: openWorld F→T                 |
| `tiktok_list_advertisers`      | `005860dbc22347e6db1a2494118b6b4fd84a9cb9259017177ebafd2cc055caff` | `7781821e5d5c6bca0b68bb8dc239448623ba8e69e1d65ebee4b561edc14fbc9a` | hints: openWorld F→T                 |
| `tiktok_get_report`            | `af7e113d337effad7ad815ee3c65f45e6fee02cc0fc8c19b81c5a77474f99448` | `a6d34b1190139e01d49ace82d360a71ec5c21650321851785f282eb4d2411199` | hints: idempotent F→T, openWorld F→T |
| `tiktok_get_report_breakdowns` | `6c9150a308aa4d832305d43e41ebcc8df0ef472aa75b4515eb02ce8ee9e5d9b7` | `64ab4c119017093bedf829929730a42f82589e3c5de454e5e91f4f2a7efbd966` | hints: idempotent F→T, openWorld F→T |
| `tiktok_check_report_status`   | `048b42b8a1be632234f97c0cb9e9fcca2fe053d3fb39e4ea84f131bf71086152` | `87198fdf20307f5830a62834ac423464b3af2a594cef9858a4b85a5b9e130b7a` | hints: openWorld F→T                 |
| `tiktok_search_targeting`      | `8682342dc94566579a3084372dc31c002b0b121e34179ef368481fba1c31ccda` | `5a1803ed150ae1409379397dfaaaf91407219110f5d19274fd412913e5a37f8b` | hints: openWorld F→T                 |
| `tiktok_get_targeting_options` | `721e15b4ee2d5a61921d1ce5d3bfed9dbf49a5c0fe6fe6d7d175f63103055db7` | `08619e7f505496d6800b0708c2f1dc6708483f8002b609fc388c857f8d92d285` | hints: openWorld F→T                 |
| `tiktok_get_audience_estimate` | `475ff2090a87d9d3f90384c0f2e27dd8c6b350f913c7e0c14e77cd8fed29ea0f` | `b89ce34d1dc2f4353b89788455d0c272d6465ed2c6bcd851dec27f53b28f16e4` | hints: openWorld F→T                 |
| `tiktok_get_ad_preview`        | `ba91ed2eed81b1d8110faa10d93914cde78cd0b45168a7a1b0edecdf8e45c92f` | `2930bc9c7c597960fa884a9572597710f0046fe75d01b5ab8ce86e96a190cbd2` | hints: openWorld F→T                 |

#### ttd-mcp (9)

| Tool                        | Old hash                                                           | New hash                                                           | What moved                           |
| --------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------ |
| `ttd_get_context`           | `f30227c03acbcff60cfda1d62aaa280b7461b76a61eef38e41e06b499c40afdb` | `4acef7117d25b34042e335df2f8129e6542b674445f6b54b08ab034825b53050` | hints: openWorld F→T                 |
| `ttd_list_entities`         | `f85c749ad24c718cd6dbcfb76f2a36a7b755c77ceece5b7af157eb74533c3452` | `c0ddaef37237050c6e34736ed3fb39ccb08f58961b88b65f12877c6e16afdf6f` | hints: openWorld F→T                 |
| `ttd_get_report`            | `b0ed94880f8d1a9c2f50ff5fcdafce4714fd8664b3596031ee95409e70dc18ca` | `7efd758b9afdcc3d2d5434470ae793ed317d15cf7c0d7dc362691699992bc35e` | hints: idempotent F→T, openWorld F→T |
| `ttd_check_report_status`   | `342ab00e7368986392628b1ace3bce839c62ef31b75c3a2234d12d11fb782723` | `bf2a7a081740ad0a3862a27564c0bb44b2746efe8d004ef7a4a733293b0ded87` | hints: openWorld F→T                 |
| `ttd_graphql_bulk_job`      | `bac85a8d5db8d6c45a031b08867de81dbc311a512814749ba4ca18ee820a2274` | `09c110a0522a83f1d0c8382ebe3e2997a42e86d81abf2ccf4af8d2c6dd6710fc` | hints: openWorld F→T                 |
| `ttd_get_ad_preview`        | `1156ed75233cb3dfe8a722fa2f4b65865a3d14e30719708d9058bed877429ab2` | `b6bf9ed53cb87a8298c9a67e4022df474795c451c75fab0295a1a82ce415578b` | hints: openWorld F→T                 |
| `ttd_list_report_schedules` | `568c2f2f0514ca9fbb3509d99325fffdf3a56a2da5ae776b38d74153a28480b4` | `04c075cf9d7ca6b489ebb2c4fd4d90e988b1ef06ae47073d5cdf901ba591311e` | hints: openWorld F→T                 |
| `ttd_get_report_schedule`   | `48f24d4fcc07aecf47b85b1dbdeb492f00138499de3410672c3a60807c3d1c13` | `e5ab49173d471cb25006a92b6435aa5d5bdf99f348f4e9f5d556793ecddb5ae1` | hints: openWorld F→T                 |
| `ttd_list_report_templates` | `4c136743bd1462c32ff74d182b6726232fc99cd34b11e9598a9650f4e4798208` | `66ec5f0489b6b7089053bebc72b9f621a2336bc370468f446c4f1098f36f106f` | hints: openWorld F→T                 |
