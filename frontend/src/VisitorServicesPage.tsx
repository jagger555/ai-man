import {
  Accessibility,
  Baby,
  CircleParking,
  Cross,
  Headset,
  LocateFixed,
  Luggage,
  MessageCircleQuestion,
  Soup,
  Toilet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type VisitorService = {
  id: string;
  title: string;
  searchTerm: string;
  description: string;
  accent: string;
  icon: LucideIcon;
};

const visitorServices: VisitorService[] = [
  {
    id: "toilet",
    title: "卫生间",
    searchTerm: "卫生间",
    description: "在景区地图中检索附近公共卫生间。",
    accent: "jade",
    icon: Toilet,
  },
  {
    id: "dining",
    title: "餐饮",
    searchTerm: "餐饮",
    description: "查找餐饮服务点，菜单与营业情况以现场为准。",
    accent: "amber",
    icon: Soup,
  },
  {
    id: "parking",
    title: "停车",
    searchTerm: "停车场",
    description: "检索景区周边停车场，余位请以现场信息为准。",
    accent: "blue",
    icon: CircleParking,
  },
  {
    id: "visitor-center",
    title: "游客中心",
    searchTerm: "游客中心",
    description: "查找综合咨询、游园协助等服务入口。",
    accent: "teal",
    icon: Headset,
  },
  {
    id: "medical",
    title: "医疗服务",
    searchTerm: "医疗服务点",
    description: "需要紧急帮助时优先联系现场工作人员。",
    accent: "red",
    icon: Cross,
  },
  {
    id: "accessible",
    title: "无障碍服务",
    searchTerm: "无障碍服务",
    description: "咨询无障碍通行与辅助设施使用方式。",
    accent: "violet",
    icon: Accessibility,
  },
  {
    id: "baby-care",
    title: "母婴服务",
    searchTerm: "母婴室",
    description: "检索母婴服务设施，具体使用情况现场确认。",
    accent: "rose",
    icon: Baby,
  },
  {
    id: "storage",
    title: "行李寄存",
    searchTerm: "行李寄存",
    description: "查找寄存服务，收费与可用情况以现场为准。",
    accent: "gold",
    icon: Luggage,
  },
];

export function VisitorServicesPage({
  onFindNearest,
  onConsult,
}: {
  onFindNearest: (searchTerm: string) => void;
  onConsult: (title: string) => void;
}) {
  return (
    <section className="visitor-services-page" aria-label="灵山胜境游客服务">
      <header className="visitor-services-head">
        <div>
          <p className="eyebrow">VISITOR SERVICES · LINGSHAN</p>
          <h1>游园服务，一页快速查找</h1>
        </div>
        <p>选择所需服务，可直接带入景区地图或向数字导游咨询。具体位置与开放情况以现场标识为准。</p>
      </header>

      <div className="visitor-service-grid">
        {visitorServices.map((service) => {
          const Icon = service.icon;
          return (
            <article key={service.id} className={`visitor-service-card is-${service.accent}`}>
              <div className="visitor-service-icon" aria-hidden="true">
                <Icon size={27} strokeWidth={1.8} />
              </div>
              <div className="visitor-service-copy">
                <h2>{service.title}</h2>
                <p>{service.description}</p>
              </div>
              <div className="visitor-service-actions">
                <button type="button" onClick={() => onFindNearest(service.searchTerm)}>
                  <LocateFixed size={15} aria-hidden="true" /> 查找最近
                </button>
                <button type="button" onClick={() => onConsult(service.title)}>
                  <MessageCircleQuestion size={15} aria-hidden="true" /> 咨询数字人
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
